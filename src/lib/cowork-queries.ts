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

// resource.service.name で event を振り分ける。
// cowork → Cowork から push、claude-code / claude_code → Claude Code CLI から push。
// raw JSONB に resource を保存しているのでそちらから引く。
function serviceFilter(serviceName: "cowork" | "claude-code") {
  if (serviceName === "cowork") {
    return sql`coalesce(${schema.coworkEvents.raw}->'resource'->>'service.name', '') = 'cowork'`;
  }
  return sql`coalesce(${schema.coworkEvents.raw}->'resource'->>'service.name', '') in ('claude-code', 'claude_code')`;
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

const SVC_COWORK = sql`coalesce(${schema.coworkEvents.raw}->'resource'->>'service.name', '') = 'cowork'`;
const SVC_CODE = sql`coalesce(${schema.coworkEvents.raw}->'resource'->>'service.name', '') in ('claude-code', 'claude_code')`;
const SVC_ANY = sql`coalesce(${schema.coworkEvents.raw}->'resource'->>'service.name', '') in ('cowork', 'claude-code', 'claude_code')`;

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
    .where(serviceFilter(service))
    .orderBy(desc(schema.coworkEvents.occurredAt))
    .limit(limit);
}
