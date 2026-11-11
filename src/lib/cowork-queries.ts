import { and, desc, gte, lte, sql } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { HIDDEN_EMAILS_LOWER } from "@/lib/hidden-emails";
import { PREVIEW } from "@/lib/preview";
import { usersRoster } from "@/lib/queries";
import { WORK_HOURS_JST } from "@/lib/seat-recommendation";
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

// ─── ロスター基準のメンバー集計（/, /members, /simulate, 月次レポート共通） ───
// events 集計（combinedMemberSummary）に組織ロスターを外側結合する。
// - ロスター在籍でイベント 0 件の人も 0 値で出す（→ 推奨は「未使用」）
// - ロスター外だが使用実績のある email も消さずに inRoster=false で残す

export type RosterMemberRow = CombinedMemberRow &
  MemberSeatSignals & {
    displayName: string | null;
    seatType: "premium" | "standard" | null;
    inRoster: boolean;
  };

export async function rosterMemberSummary(opts: {
  from?: Date;
  to?: Date;
}): Promise<RosterMemberRow[]> {
  const [members, roster, signals] = await Promise.all([
    combinedMemberSummary(opts),
    usersRoster(),
    memberSeatSignals(opts),
  ]);
  const rosterByEmail = new Map(roster.map((u) => [u.email.toLowerCase(), u]));
  const seen = new Set<string>();
  const rows: RosterMemberRow[] = members.map((m) => {
    const key = m.email.toLowerCase();
    seen.add(key);
    const u = rosterByEmail.get(key);
    return {
      ...m,
      ...(signals.get(key) ?? EMPTY_SIGNALS),
      displayName: u?.displayName ?? null,
      seatType: toSeat(u?.seatType ?? null),
      inRoster: Boolean(u),
    };
  });
  for (const u of roster) {
    if (seen.has(u.email)) continue;
    rows.push({
      email: u.email,
      coworkCostCents: 0,
      codeCostCents: 0,
      totalCostCents: 0,
      coworkPrompts: 0,
      codePrompts: 0,
      coworkTokens: 0,
      codeTokens: 0,
      totalTokens: 0,
      firstSeen: null,
      lastSeen: null,
      ...EMPTY_SIGNALS,
      displayName: u.displayName,
      seatType: toSeat(u.seatType),
      inRoster: true,
    });
  }
  // ロスター在籍 → コスト降順、ロスター外は末尾
  return rows.sort(
    (a, b) =>
      Number(b.inRoster) - Number(a.inRoster) || b.totalCostCents - a.totalCostCents
  );
}

function toSeat(v: string | null): "premium" | "standard" | null {
  return v === "premium" || v === "standard" ? v : null;
}

// 生イベント（cowork_events）が残っている最古時刻。月次運用で古い raw は削除されるため、
// 期間プリセットがこれより前を指しても実データはここから。
export async function eventsDataStart(): Promise<Date | null> {
  if (PREVIEW) return null;
  const rows = await db
    .select({ min: sql<string | null>`min(${schema.coworkEvents.occurredAt})` })
    .from(schema.coworkEvents);
  const v = rows[0]?.min;
  return v ? new Date(v) : null;
}

// ─── 稼働・上限シグナル（seat 推奨の判定材料） ─────────────────────
// - activeDays / maxDayCostCents: 日次（JST）の稼働日数と最大日コスト
// - rateLimitDays: 制限到達（api_error かつ HTTP 429）があった JST 日数。
//   OAuth 切れ・バージョン不一致・通信断などの api_error は数えない
// - workPeaksCents: 勤務時間（平日 10–18 時 JST）の各日について、
//   「その時点の直前 5 時間の利用額」の最大値（Standard / Premium の上限は 5h ローリング窓）

export type MemberSeatSignals = {
  activeDays: number;
  maxDayCostCents: number;
  rateLimitDays: number;
  workPeaksCents: number[];
};

const EMPTY_SIGNALS: MemberSeatSignals = {
  activeDays: 0,
  maxDayCostCents: 0,
  rateLimitDays: 0,
  workPeaksCents: [],
};

export async function memberSeatSignals(opts: {
  from?: Date;
  to?: Date;
}): Promise<Map<string, MemberSeatSignals>> {
  const out = new Map<string, MemberSeatSignals>();
  if (PREVIEW) {
    for (const m of COWORK_MOCK_MEMBERS) {
      const activeDays = Math.min(30, Math.max(1, Math.round(m.promptCount / 8)));
      const perDay = m.totalCostCents / Math.max(1, activeDays);
      out.set(m.email.toLowerCase(), {
        activeDays,
        maxDayCostCents: Math.round(perDay * 1.6),
        rateLimitDays: m.apiErrorCount >= 2 ? m.apiErrorCount : 0,
        workPeaksCents: Array.from({ length: Math.min(activeDays, 20) }, (_, i) =>
          Math.round(perDay * (0.4 + ((i * 37) % 10) / 10))
        ),
      });
    }
    return out;
  }
  const { fromD, toD } = rangeBounds(opts.from, opts.to);
  const hidden = sql.join(
    HIDDEN_EMAILS_LOWER.map((e) => sql`${e}`),
    sql`, `
  );
  const services = sql`('cowork', 'claude-code', 'claude_code', 'claude-code-desktop')`;
  const { startHour, endHour } = WORK_HOURS_JST;

  const res = await db.execute(sql`
    with ev as (
      select lower(user_email) as u,
             occurred_at as t,
             (occurred_at at time zone 'Asia/Tokyo') as jt,
             coalesce(cost_usd_cents, 0) as c,
             event_name,
             status_code
      from cowork_events
      where occurred_at >= ${fromD} and occurred_at <= ${toD}
        and user_email is not null
        and lower(user_email) not in (${hidden})
        and coalesce(service_name, '') in ${services}
    ),
    daily as (
      select u, jt::date as d, sum(c) as day_cents from ev group by 1, 2
    ),
    win as (
      select u, jt,
             sum(c) over (partition by u order by t
                          range between interval '5 hours' preceding and current row) as w5
      from ev where c > 0
    ),
    work_peak as (
      select u, jt::date as d, max(w5) as peak from win
      where extract(isodow from jt) <= 5
        and extract(hour from jt) >= ${startHour} and extract(hour from jt) < ${endHour}
      group by 1, 2
    ),
    hits as (
      select u, count(distinct jt::date) as hit_days from ev
      where event_name = 'api_error' and status_code = 429
      group by 1
    )
    select d.u as email,
           count(*)::int as active_days,
           coalesce(max(d.day_cents), 0)::bigint as max_day_cents,
           coalesce((select hit_days from hits h where h.u = d.u), 0)::int as rate_limit_days,
           coalesce((select array_agg(peak::bigint order by wp.d) from work_peak wp where wp.u = d.u), '{}') as work_peaks
    from daily d
    group by d.u
  `);
  for (const r of res.rows as Array<Record<string, unknown>>) {
    const email = String(r.email ?? "");
    if (!email) continue;
    out.set(email, {
      activeDays: Number(r.active_days ?? 0),
      maxDayCostCents: Number(r.max_day_cents ?? 0),
      rateLimitDays: Number(r.rate_limit_days ?? 0),
      workPeaksCents: ((r.work_peaks as Array<string | number> | null) ?? []).map(Number),
    });
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
