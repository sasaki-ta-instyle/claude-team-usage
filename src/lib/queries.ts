import { and, desc, gte, lte, sql } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { isoDateMinusDays, monthStartIso } from "@/lib/format";
import {
  PREVIEW,
  mockApiCostByModel,
  mockApiCostByType,
  mockApiCostByWorkspace,
  mockApiCostDailyTrend,
  mockApiCostTotalCents,
  mockMembers,
  mockMemberDailyTrend,
  mockMessagesSummary,
  mockSyncLog,
  mockUser,
} from "@/lib/preview";

export type UserRosterEntry = {
  email: string;
  displayName: string | null;
  seatType: string | null;
  isAdmin: boolean;
};

// users テーブルの全件（Anthropic Admin API sync?source=users で投入される
// シート保有者の正本）。/ ページの「未使用」KPI と /simulate の現在 seat 比較で使う。
export async function usersRoster(): Promise<UserRosterEntry[]> {
  if (PREVIEW) {
    return mockMembers().map((m) => ({
      email: m.email,
      displayName: m.displayName,
      seatType: m.seatType,
      isAdmin: m.isAdmin,
    }));
  }
  const rows = await db.select().from(schema.users);
  return rows.map((u) => ({
    email: u.email.toLowerCase(),
    displayName: u.displayName ?? u.name ?? null,
    seatType: u.seatType ?? null,
    isAdmin: u.isAdmin ?? false,
  }));
}

export type MemberRow = {
  email: string;
  displayName: string | null;
  seatType: string | null;
  isAdmin: boolean;
  sessions: number;
  commits: number;
  prs: number;
  tokens: number;
  costCents: number;
};

export async function memberSummary(opts: {
  fromDate?: string;
  toDate?: string;
}): Promise<MemberRow[]> {
  if (PREVIEW) return mockMembers();
  const fromDate = opts.fromDate ?? monthStartIso();
  const toDate = opts.toDate ?? isoDateMinusDays(0);

  const rows = await db
    .select({
      email: schema.codeUsageDaily.userEmail,
      sessions: sql<number>`coalesce(sum(${schema.codeUsageDaily.sessions}), 0)`,
      commits: sql<number>`coalesce(sum(${schema.codeUsageDaily.commits}), 0)`,
      prs: sql<number>`coalesce(sum(${schema.codeUsageDaily.prs}), 0)`,
      tokens: sql<number>`coalesce(sum(${schema.codeUsageDaily.tokensInput} + ${schema.codeUsageDaily.tokensOutput} + ${schema.codeUsageDaily.tokensCacheRead} + ${schema.codeUsageDaily.tokensCacheCreation}), 0)`,
      costCents: sql<number>`coalesce(sum(${schema.codeUsageDaily.estimatedCostCents}), 0)`,
    })
    .from(schema.codeUsageDaily)
    .where(
      and(
        gte(schema.codeUsageDaily.date, fromDate),
        lte(schema.codeUsageDaily.date, toDate)
      )
    )
    .groupBy(schema.codeUsageDaily.userEmail);

  const userByEmail = new Map<
    string,
    { displayName: string | null; seatType: string | null; isAdmin: boolean }
  >();
  for (const u of await db.select().from(schema.users)) {
    userByEmail.set(u.email.toLowerCase(), {
      displayName: u.displayName ?? u.name ?? null,
      seatType: u.seatType ?? null,
      isAdmin: u.isAdmin ?? false,
    });
  }

  return rows
    .map((r): MemberRow => {
      const u = userByEmail.get(r.email);
      return {
        email: r.email,
        displayName: u?.displayName ?? null,
        seatType: u?.seatType ?? null,
        isAdmin: u?.isAdmin ?? false,
        sessions: Number(r.sessions ?? 0),
        commits: Number(r.commits ?? 0),
        prs: Number(r.prs ?? 0),
        tokens: Number(r.tokens ?? 0),
        costCents: Number(r.costCents ?? 0),
      };
    })
    .sort((a, b) => b.costCents - a.costCents);
}

export async function memberDailyTrend(email: string, days = 30) {
  if (PREVIEW) return mockMemberDailyTrend(email, days);
  const fromDate = isoDateMinusDays(days);
  const toDate = isoDateMinusDays(0);
  return db
    .select({
      date: schema.codeUsageDaily.date,
      tokensInput: schema.codeUsageDaily.tokensInput,
      tokensOutput: schema.codeUsageDaily.tokensOutput,
      tokensCacheRead: schema.codeUsageDaily.tokensCacheRead,
      tokensCacheCreation: schema.codeUsageDaily.tokensCacheCreation,
      sessions: schema.codeUsageDaily.sessions,
      commits: schema.codeUsageDaily.commits,
      prs: schema.codeUsageDaily.prs,
      estimatedCostCents: schema.codeUsageDaily.estimatedCostCents,
    })
    .from(schema.codeUsageDaily)
    .where(
      and(
        sql`${schema.codeUsageDaily.userEmail} = ${email.toLowerCase()}`,
        gte(schema.codeUsageDaily.date, fromDate),
        lte(schema.codeUsageDaily.date, toDate)
      )
    )
    .orderBy(schema.codeUsageDaily.date);
}

export async function getUserByEmail(email: string) {
  const e = email.toLowerCase();
  if (PREVIEW) return mockUser(e);
  return db.query.users.findFirst({
    where: (t, { eq }) => eq(t.email, e),
  });
}

export async function syncLogRows(limit = 20) {
  if (PREVIEW) return mockSyncLog().slice(0, limit);
  return db
    .select()
    .from(schema.syncLog)
    .orderBy(desc(schema.syncLog.ranAt))
    .limit(limit);
}

export async function messagesUsageSummary(opts: {
  fromDate?: string;
  toDate?: string;
}) {
  if (PREVIEW) return mockMessagesSummary();
  const fromDate = opts.fromDate ?? monthStartIso();
  const toDate = opts.toDate ?? isoDateMinusDays(0);

  const rows = await db
    .select({
      accountId: schema.messagesUsageDaily.accountId,
      workspaceId: schema.messagesUsageDaily.workspaceId,
      apiKeyId: schema.messagesUsageDaily.apiKeyId,
      model: schema.messagesUsageDaily.model,
      tokensInput: sql<number>`coalesce(sum(${schema.messagesUsageDaily.tokensInput}), 0)`,
      tokensOutput: sql<number>`coalesce(sum(${schema.messagesUsageDaily.tokensOutput}), 0)`,
      tokensCacheRead: sql<number>`coalesce(sum(${schema.messagesUsageDaily.tokensCacheRead}), 0)`,
      tokensCacheCreation: sql<number>`coalesce(sum(${schema.messagesUsageDaily.tokensCacheCreation}), 0)`,
    })
    .from(schema.messagesUsageDaily)
    .where(
      and(
        gte(schema.messagesUsageDaily.date, fromDate),
        lte(schema.messagesUsageDaily.date, toDate)
      )
    )
    .groupBy(
      schema.messagesUsageDaily.accountId,
      schema.messagesUsageDaily.workspaceId,
      schema.messagesUsageDaily.apiKeyId,
      schema.messagesUsageDaily.model
    );

  return rows.map((r) => ({
    ...r,
    tokensInput: Number(r.tokensInput ?? 0),
    tokensOutput: Number(r.tokensOutput ?? 0),
    tokensCacheRead: Number(r.tokensCacheRead ?? 0),
    tokensCacheCreation: Number(r.tokensCacheCreation ?? 0),
  }));
}

// ─── コンソール API 課金（Cost Report） ───
// amount_cents は cents（小数あり）。集計結果はそのまま cents として既存の
// formatUsd / formatJpyFromCents に渡せる（どちらも cents / 100 で USD 化）。

export type ApiCostWorkspaceRow = {
  workspaceId: string;
  name: string;
  costCents: number;
};
export type ApiCostBreakdownRow = { label: string; costCents: number };
export type ApiCostTrendPoint = { date: string; costCents: number };

const COST_SUM = sql<number>`coalesce(sum(${schema.costReportDaily.amountCents}), 0)`;

export async function apiCostTotalCents(opts: {
  fromDate?: string;
  toDate?: string;
}): Promise<number> {
  if (PREVIEW) return mockApiCostTotalCents();
  const fromDate = opts.fromDate ?? monthStartIso();
  const toDate = opts.toDate ?? isoDateMinusDays(0);
  const [row] = await db
    .select({ total: COST_SUM })
    .from(schema.costReportDaily)
    .where(
      and(
        gte(schema.costReportDaily.date, fromDate),
        lte(schema.costReportDaily.date, toDate)
      )
    );
  return Number(row?.total ?? 0);
}

export async function apiCostByWorkspace(opts: {
  fromDate?: string;
  toDate?: string;
}): Promise<ApiCostWorkspaceRow[]> {
  if (PREVIEW) return mockApiCostByWorkspace();
  const fromDate = opts.fromDate ?? monthStartIso();
  const toDate = opts.toDate ?? isoDateMinusDays(0);
  const rows = await db
    .select({
      workspaceId: schema.costReportDaily.workspaceId,
      name: schema.workspaces.name,
      costCents: COST_SUM,
    })
    .from(schema.costReportDaily)
    .leftJoin(
      schema.workspaces,
      sql`${schema.costReportDaily.workspaceId} = ${schema.workspaces.id}`
    )
    .where(
      and(
        gte(schema.costReportDaily.date, fromDate),
        lte(schema.costReportDaily.date, toDate)
      )
    )
    .groupBy(schema.costReportDaily.workspaceId, schema.workspaces.name);

  return rows
    .map((r) => ({
      workspaceId: r.workspaceId,
      name: r.name ?? (r.workspaceId ? r.workspaceId : "default workspace"),
      costCents: Number(r.costCents ?? 0),
    }))
    .sort((a, b) => b.costCents - a.costCents);
}

export async function apiCostByModel(opts: {
  fromDate?: string;
  toDate?: string;
}): Promise<ApiCostBreakdownRow[]> {
  if (PREVIEW) return mockApiCostByModel();
  const fromDate = opts.fromDate ?? monthStartIso();
  const toDate = opts.toDate ?? isoDateMinusDays(0);
  const rows = await db
    .select({ label: schema.costReportDaily.model, costCents: COST_SUM })
    .from(schema.costReportDaily)
    .where(
      and(
        gte(schema.costReportDaily.date, fromDate),
        lte(schema.costReportDaily.date, toDate)
      )
    )
    .groupBy(schema.costReportDaily.model);

  return rows
    .map((r) => ({
      label: r.label || "—",
      costCents: Number(r.costCents ?? 0),
    }))
    .sort((a, b) => b.costCents - a.costCents);
}

export async function apiCostByType(opts: {
  fromDate?: string;
  toDate?: string;
}): Promise<ApiCostBreakdownRow[]> {
  if (PREVIEW) return mockApiCostByType();
  const fromDate = opts.fromDate ?? monthStartIso();
  const toDate = opts.toDate ?? isoDateMinusDays(0);
  const rows = await db
    .select({ label: schema.costReportDaily.costType, costCents: COST_SUM })
    .from(schema.costReportDaily)
    .where(
      and(
        gte(schema.costReportDaily.date, fromDate),
        lte(schema.costReportDaily.date, toDate)
      )
    )
    .groupBy(schema.costReportDaily.costType);

  return rows
    .map((r) => ({
      label: r.label || "—",
      costCents: Number(r.costCents ?? 0),
    }))
    .sort((a, b) => b.costCents - a.costCents);
}

export async function apiCostDailyTrend(opts: {
  fromDate?: string;
  toDate?: string;
}): Promise<ApiCostTrendPoint[]> {
  if (PREVIEW) return mockApiCostDailyTrend();
  const fromDate = opts.fromDate ?? monthStartIso();
  const toDate = opts.toDate ?? isoDateMinusDays(0);
  const rows = await db
    .select({ date: schema.costReportDaily.date, costCents: COST_SUM })
    .from(schema.costReportDaily)
    .where(
      and(
        gte(schema.costReportDaily.date, fromDate),
        lte(schema.costReportDaily.date, toDate)
      )
    )
    .groupBy(schema.costReportDaily.date)
    .orderBy(schema.costReportDaily.date);

  return rows.map((r) => ({
    date: String(r.date),
    costCents: Number(r.costCents ?? 0),
  }));
}
