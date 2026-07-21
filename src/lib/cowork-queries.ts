import { and, desc, gte, lte, sql } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { PREVIEW } from "@/lib/preview";
import {
  COWORK_MOCK_MEMBERS,
  mockCoworkOverall,
  mockCoworkRecentEvents,
} from "@/lib/cowork-preview";

export type CoworkMemberRow = {
  email: string;
  promptCount: number;
  apiRequestCount: number;
  apiErrorCount: number;
  toolUseCount: number;
  toolRejectCount: number;
  totalCostCents: number;
  inputTokens: number;
  outputTokens: number;
  firstSeen: string | null;
  lastSeen: string | null;
};

function rangeBounds(from?: Date, to?: Date) {
  const toD = to ?? new Date();
  const fromD = from ?? new Date(toD.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { fromD, toD };
}

// ダッシュボード上で非表示にしたい email。DB 側は保持したまま集計・表示から除外する。
// 恒久対応（個人 gmail 側で Claude Code を打っている本人が org アカウントに切り替えるまでの措置）。
const HIDDEN_EMAILS_LOWER = ["375tanabe.o8@gmail.com"];
const hiddenEmailFilter = sql`coalesce(lower(${schema.coworkEvents.userEmail}), '') not in (${sql.join(
  HIDDEN_EMAILS_LOWER.map((e) => sql`${e}`),
  sql`, `
)})`;

// resource.service.name で event を振り分ける。
// cowork → Cowork から push、
// claude-code / claude_code / claude-code-desktop → Claude Code CLI / Desktop から push。
// 正規化済みの service_name カラムを使う（旧: raw JSONB から抽出）。
function serviceFilter(serviceName: "cowork" | "claude-code") {
  if (serviceName === "cowork") {
    return sql`coalesce(${schema.coworkEvents.serviceName}, '') = 'cowork'`;
  }
  return sql`coalesce(${schema.coworkEvents.serviceName}, '') in ('claude-code', 'claude_code', 'claude-code-desktop')`;
}

export async function coworkMemberSummary(opts: {
  from?: Date;
  to?: Date;
  service?: "cowork" | "claude-code";
}): Promise<CoworkMemberRow[]> {
  if (PREVIEW) return COWORK_MOCK_MEMBERS.map((m) => ({ ...m }));
  const { fromD, toD } = rangeBounds(opts.from, opts.to);
  const service = opts.service ?? "cowork";

  const rows = await db
    .select({
      email: schema.coworkEvents.userEmail,
      promptCount: sql<number>`coalesce(sum(case when ${schema.coworkEvents.eventName} = 'user_prompt' then 1 else 0 end), 0)`,
      apiRequestCount: sql<number>`coalesce(sum(case when ${schema.coworkEvents.eventName} = 'api_request' then 1 else 0 end), 0)`,
      apiErrorCount: sql<number>`coalesce(sum(case when ${schema.coworkEvents.eventName} = 'api_error' then 1 else 0 end), 0)`,
      toolUseCount: sql<number>`coalesce(sum(case when ${schema.coworkEvents.eventName} = 'tool_result' then 1 else 0 end), 0)`,
      toolRejectCount: sql<number>`coalesce(sum(case when ${schema.coworkEvents.eventName} = 'tool_decision' and ${schema.coworkEvents.decision} = 'reject' then 1 else 0 end), 0)`,
      totalCostCents: sql<number>`coalesce(sum(${schema.coworkEvents.costUsdCents}), 0)`,
      inputTokens: sql<number>`coalesce(sum(${schema.coworkEvents.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${schema.coworkEvents.outputTokens}), 0)`,
      firstSeen: sql<string | null>`min(${schema.coworkEvents.occurredAt})`,
      lastSeen: sql<string | null>`max(${schema.coworkEvents.occurredAt})`,
    })
    .from(schema.coworkEvents)
    .where(
      and(
        gte(schema.coworkEvents.occurredAt, fromD),
        lte(schema.coworkEvents.occurredAt, toD),
        sql`${schema.coworkEvents.userEmail} is not null`,
        hiddenEmailFilter,
        serviceFilter(service)
      )
    )
    .groupBy(schema.coworkEvents.userEmail);

  return rows
    .filter((r): r is typeof r & { email: string } => !!r.email)
    .map(
      (r): CoworkMemberRow => ({
        email: r.email,
        promptCount: Number(r.promptCount ?? 0),
        apiRequestCount: Number(r.apiRequestCount ?? 0),
        apiErrorCount: Number(r.apiErrorCount ?? 0),
        toolUseCount: Number(r.toolUseCount ?? 0),
        toolRejectCount: Number(r.toolRejectCount ?? 0),
        totalCostCents: Number(r.totalCostCents ?? 0),
        inputTokens: Number(r.inputTokens ?? 0),
        outputTokens: Number(r.outputTokens ?? 0),
        firstSeen: r.firstSeen ? String(r.firstSeen) : null,
        lastSeen: r.lastSeen ? String(r.lastSeen) : null,
      })
    )
    .sort((a, b) => b.totalCostCents - a.totalCostCents);
}

export async function coworkOverall(opts: {
  from?: Date;
  to?: Date;
  service?: "cowork" | "claude-code";
}) {
  if (PREVIEW) return mockCoworkOverall();
  const { fromD, toD } = rangeBounds(opts.from, opts.to);
  const service = opts.service ?? "cowork";
  const rows = await db
    .select({
      uniqueUsers: sql<number>`count(distinct ${schema.coworkEvents.userEmail})`,
      promptCount: sql<number>`coalesce(sum(case when ${schema.coworkEvents.eventName} = 'user_prompt' then 1 else 0 end), 0)`,
      apiErrorCount: sql<number>`coalesce(sum(case when ${schema.coworkEvents.eventName} = 'api_error' then 1 else 0 end), 0)`,
      totalCostCents: sql<number>`coalesce(sum(${schema.coworkEvents.costUsdCents}), 0)`,
      totalTokens: sql<number>`coalesce(sum(coalesce(${schema.coworkEvents.inputTokens}, 0) + coalesce(${schema.coworkEvents.outputTokens}, 0)), 0)`,
    })
    .from(schema.coworkEvents)
    .where(
      and(
        gte(schema.coworkEvents.occurredAt, fromD),
        lte(schema.coworkEvents.occurredAt, toD),
        hiddenEmailFilter,
        serviceFilter(service)
      )
    );
  const r = rows[0] ?? {
    uniqueUsers: 0,
    promptCount: 0,
    apiErrorCount: 0,
    totalCostCents: 0,
    totalTokens: 0,
  };
  return {
    uniqueUsers: Number(r.uniqueUsers ?? 0),
    promptCount: Number(r.promptCount ?? 0),
    apiErrorCount: Number(r.apiErrorCount ?? 0),
    totalCostCents: Number(r.totalCostCents ?? 0),
    totalTokens: Number(r.totalTokens ?? 0),
  };
}

// ─── Cowork + Code を統合した集計（メイン画面が使う） ───

export type CombinedMemberRow = {
  email: string;
  coworkCostCents: number;
  codeCostCents: number;
  totalCostCents: number;
  coworkPrompts: number;
  codePrompts: number;
  coworkTokens: number;
  codeTokens: number;
  totalTokens: number;
  firstSeen: string | null;
  lastSeen: string | null;
};

const SVC_COWORK = sql`coalesce(${schema.coworkEvents.serviceName}, '') = 'cowork'`;
const SVC_CODE = sql`coalesce(${schema.coworkEvents.serviceName}, '') in ('claude-code', 'claude_code', 'claude-code-desktop')`;
const SVC_ANY = sql`coalesce(${schema.coworkEvents.serviceName}, '') in ('cowork', 'claude-code', 'claude_code', 'claude-code-desktop')`;

export async function combinedMemberSummary(opts: {
  from?: Date;
  to?: Date;
}): Promise<CombinedMemberRow[]> {
  if (PREVIEW) {
    return COWORK_MOCK_MEMBERS.map((m) => {
      const cowork = Math.round(m.totalCostCents * 0.62);
      const code = m.totalCostCents - cowork;
      const tokens = m.inputTokens + m.outputTokens;
      return {
        email: m.email,
        coworkCostCents: cowork,
        codeCostCents: code,
        totalCostCents: m.totalCostCents,
        coworkPrompts: Math.round(m.promptCount * 0.7),
        codePrompts: m.promptCount - Math.round(m.promptCount * 0.7),
        coworkTokens: Math.round(tokens * 0.6),
        codeTokens: tokens - Math.round(tokens * 0.6),
        totalTokens: tokens,
        firstSeen: m.firstSeen,
        lastSeen: m.lastSeen,
      };
    });
  }
  const { fromD, toD } = rangeBounds(opts.from, opts.to);

  const rows = await db
    .select({
      email: schema.coworkEvents.userEmail,
      coworkCost: sql<number>`coalesce(sum(case when ${SVC_COWORK} then ${schema.coworkEvents.costUsdCents} else 0 end), 0)`,
      codeCost: sql<number>`coalesce(sum(case when ${SVC_CODE} then ${schema.coworkEvents.costUsdCents} else 0 end), 0)`,
      coworkPrompts: sql<number>`coalesce(sum(case when ${SVC_COWORK} and ${schema.coworkEvents.eventName} = 'user_prompt' then 1 else 0 end), 0)`,
      codePrompts: sql<number>`coalesce(sum(case when ${SVC_CODE} and ${schema.coworkEvents.eventName} = 'user_prompt' then 1 else 0 end), 0)`,
      coworkTokens: sql<number>`coalesce(sum(case when ${SVC_COWORK} then coalesce(${schema.coworkEvents.inputTokens}, 0) + coalesce(${schema.coworkEvents.outputTokens}, 0) else 0 end), 0)`,
      codeTokens: sql<number>`coalesce(sum(case when ${SVC_CODE} then coalesce(${schema.coworkEvents.inputTokens}, 0) + coalesce(${schema.coworkEvents.outputTokens}, 0) else 0 end), 0)`,
      firstSeen: sql<string | null>`min(${schema.coworkEvents.occurredAt})`,
      lastSeen: sql<string | null>`max(${schema.coworkEvents.occurredAt})`,
    })
    .from(schema.coworkEvents)
    .where(
      and(
        gte(schema.coworkEvents.occurredAt, fromD),
        lte(schema.coworkEvents.occurredAt, toD),
        sql`${schema.coworkEvents.userEmail} is not null`,
        hiddenEmailFilter,
        SVC_ANY
      )
    )
    .groupBy(schema.coworkEvents.userEmail);

  return rows
    .filter((r): r is typeof r & { email: string } => !!r.email)
    .map((r): CombinedMemberRow => {
      const cowork = Number(r.coworkCost ?? 0);
      const code = Number(r.codeCost ?? 0);
      const coworkTokens = Number(r.coworkTokens ?? 0);
      const codeTokens = Number(r.codeTokens ?? 0);
      return {
        email: r.email,
        coworkCostCents: cowork,
        codeCostCents: code,
        totalCostCents: cowork + code,
        coworkPrompts: Number(r.coworkPrompts ?? 0),
        codePrompts: Number(r.codePrompts ?? 0),
        coworkTokens,
        codeTokens,
        totalTokens: coworkTokens + codeTokens,
        firstSeen: r.firstSeen ? String(r.firstSeen) : null,
        lastSeen: r.lastSeen ? String(r.lastSeen) : null,
      };
    })
    .sort((a, b) => b.totalCostCents - a.totalCostCents);
}

export async function combinedOverall(opts: { from?: Date; to?: Date }) {
  if (PREVIEW) {
    const co = mockCoworkOverall();
    return {
      uniqueUsers: co.uniqueUsers,
      promptCount: co.promptCount,
      coworkCostCents: Math.round(co.totalCostCents * 0.62),
      codeCostCents: co.totalCostCents - Math.round(co.totalCostCents * 0.62),
      totalCostCents: co.totalCostCents,
      totalTokens: co.totalTokens,
    };
  }
  const { fromD, toD } = rangeBounds(opts.from, opts.to);
  const rows = await db
    .select({
      uniqueUsers: sql<number>`count(distinct ${schema.coworkEvents.userEmail})`,
      promptCount: sql<number>`coalesce(sum(case when ${schema.coworkEvents.eventName} = 'user_prompt' then 1 else 0 end), 0)`,
      coworkCost: sql<number>`coalesce(sum(case when ${SVC_COWORK} then ${schema.coworkEvents.costUsdCents} else 0 end), 0)`,
      codeCost: sql<number>`coalesce(sum(case when ${SVC_CODE} then ${schema.coworkEvents.costUsdCents} else 0 end), 0)`,
      totalTokens: sql<number>`coalesce(sum(coalesce(${schema.coworkEvents.inputTokens}, 0) + coalesce(${schema.coworkEvents.outputTokens}, 0)), 0)`,
    })
    .from(schema.coworkEvents)
    .where(
      and(
        gte(schema.coworkEvents.occurredAt, fromD),
        lte(schema.coworkEvents.occurredAt, toD),
        hiddenEmailFilter,
        SVC_ANY
      )
    );
  const r = rows[0] ?? {
    uniqueUsers: 0,
    promptCount: 0,
    coworkCost: 0,
    codeCost: 0,
    totalTokens: 0,
  };
  const cowork = Number(r.coworkCost ?? 0);
  const code = Number(r.codeCost ?? 0);
  return {
    uniqueUsers: Number(r.uniqueUsers ?? 0),
    promptCount: Number(r.promptCount ?? 0),
    coworkCostCents: cowork,
    codeCostCents: code,
    totalCostCents: cowork + code,
    totalTokens: Number(r.totalTokens ?? 0),
  };
}

// ─── 日次稼働シグナル ─────────────────────────────────────────
// rate limit reset（5 時間 rolling）は per-user カラムが取れないので、
// 「日次のアクティビティ密度」と「api_error 回数」で制限到達を間接的に検知する。

export type MemberActivitySignals = {
  activeDays: number;
  maxDayCostCents: number;
  apiErrorCount: number;
};

export async function memberActivitySignals(opts: {
  from?: Date;
  to?: Date;
}): Promise<Map<string, MemberActivitySignals>> {
  const out = new Map<string, MemberActivitySignals>();
  if (PREVIEW) {
    // モック: 既存 cowork mock の promptCount からそれっぽい値を生成
    for (const m of COWORK_MOCK_MEMBERS) {
      const promptCount = m.promptCount;
      const activeDays = Math.min(30, Math.max(1, Math.round(promptCount / 8)));
      const maxDayCostCents = Math.round(m.totalCostCents / Math.max(1, activeDays) * 1.6);
      out.set(m.email.toLowerCase(), {
        activeDays,
        maxDayCostCents,
        apiErrorCount: m.apiErrorCount,
      });
    }
    return out;
  }
  const { fromD, toD } = rangeBounds(opts.from, opts.to);
  // 2 段集計: per-day 合計 → user で MAX / COUNT / SUM
  const perDay = db.$with("per_day").as(
    db
      .select({
        email: schema.coworkEvents.userEmail,
        day: sql<string>`date(${schema.coworkEvents.occurredAt})`.as("day"),
        dayCents: sql<number>`coalesce(sum(${schema.coworkEvents.costUsdCents}), 0)`.as("day_cents"),
        errors: sql<number>`coalesce(sum(case when ${schema.coworkEvents.eventName} = 'api_error' then 1 else 0 end), 0)`.as("errors"),
      })
      .from(schema.coworkEvents)
      .where(
        and(
          gte(schema.coworkEvents.occurredAt, fromD),
          lte(schema.coworkEvents.occurredAt, toD),
          sql`${schema.coworkEvents.userEmail} is not null`,
          hiddenEmailFilter,
          SVC_ANY
        )
      )
      .groupBy(schema.coworkEvents.userEmail, sql`date(${schema.coworkEvents.occurredAt})`)
  );
  const rows = await db
    .with(perDay)
    .select({
      email: perDay.email,
      activeDays: sql<number>`count(*)`,
      maxDayCents: sql<number>`coalesce(max(${perDay.dayCents}), 0)`,
      errorTotal: sql<number>`coalesce(sum(${perDay.errors}), 0)`,
    })
    .from(perDay)
    .groupBy(perDay.email);
  for (const r of rows) {
    if (!r.email) continue;
    out.set(r.email.toLowerCase(), {
      activeDays: Number(r.activeDays ?? 0),
      maxDayCostCents: Number(r.maxDayCents ?? 0),
      apiErrorCount: Number(r.errorTotal ?? 0),
    });
  }
  return out;
}

// users テーブルの seat_type を email → seat_type の Map で返す。
// メアドとティアだけで管理する運用のため、他カラムは触らない。
// email は小文字化して返す（cowork_events / code_usage_daily 側と揃える）。
export async function getSeatAssignments(): Promise<Map<string, "premium" | "standard" | null>> {
  const out = new Map<string, "premium" | "standard" | null>();
  if (PREVIEW) return out;
  const rows = await db
    .select({
      email: schema.users.email,
      seatType: schema.users.seatType,
    })
    .from(schema.users);
  for (const r of rows) {
    if (!r.email) continue;
    const seat =
      r.seatType === "premium" || r.seatType === "standard" ? r.seatType : null;
    out.set(r.email.toLowerCase(), seat);
  }
  return out;
}

export async function coworkRecentEvents(opts: {
  limit?: number;
  service?: "cowork" | "claude-code";
} = {}) {
  const limit = opts.limit ?? 20;
  const service = opts.service ?? "cowork";
  if (PREVIEW) return mockCoworkRecentEvents().slice(0, limit);
  return db
    .select({
      id: schema.coworkEvents.id,
      occurredAt: schema.coworkEvents.occurredAt,
      eventName: schema.coworkEvents.eventName,
      userEmail: schema.coworkEvents.userEmail,
      model: schema.coworkEvents.model,
      costUsdCents: schema.coworkEvents.costUsdCents,
      toolName: schema.coworkEvents.toolName,
      decision: schema.coworkEvents.decision,
      errorText: schema.coworkEvents.errorText,
    })
    .from(schema.coworkEvents)
    .where(and(serviceFilter(service), hiddenEmailFilter))
    .orderBy(desc(schema.coworkEvents.occurredAt))
    .limit(limit);
}
