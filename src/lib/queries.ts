import { and, desc, gte, lte, sql } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { isoDateMinusDays, monthStartIso } from "@/lib/format";

export const PREMIUM_COST_CENTS_DEFAULT = 5000; // $50.00

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
  return db.query.users.findFirst({
    where: (t, { eq }) => eq(t.email, e),
  });
}

export async function syncLogRows(limit = 20) {
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
