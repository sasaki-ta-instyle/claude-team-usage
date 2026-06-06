import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db/client";
import {
  fetchCodeUsage,
  fetchCostReport,
  fetchMessagesUsage,
  fetchUsers,
  fetchWorkspaces,
  type CodeUsageRow,
  type MessagesUsageRow,
  type OrganizationUser,
} from "@/lib/anthropic-admin";
import { isoDateMinusDays } from "@/lib/format";
import { PREVIEW } from "@/lib/preview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROLLING_DAYS = 7;

function checkAuth(req: Request): boolean {
  const token = process.env.SYNC_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${token}`;
}

async function logSync(args: {
  source: string;
  fromDate: string | null;
  toDate: string | null;
  rowsUpserted: number;
  status: "ok" | "error";
  errorText?: string;
  durationMs: number;
}) {
  await db.insert(schema.syncLog).values({
    source: args.source,
    fromDate: args.fromDate,
    toDate: args.toDate,
    rowsUpserted: args.rowsUpserted,
    status: args.status,
    errorText: args.errorText,
    durationMs: args.durationMs,
  });
}

type CodeUpsert = NonNullable<ReturnType<typeof rowFromCode>>;

async function syncCode(from: string, to: string): Promise<number> {
  let rows = 0;
  const seen = new Map<string, CodeUpsert>();
  for await (const row of fetchCodeUsage(from)) {
    const mapped = rowFromCode(row);
    if (!mapped) continue;
    if (mapped.date < from || mapped.date > to) continue;
    const key = `${mapped.date}::${mapped.userEmail}`;
    // Last-write-wins if the API returns multiple entries per (date, user).
    seen.set(key, mapped);
  }
  for (const mapped of seen.values()) {
    await db
      .insert(schema.codeUsageDaily)
      .values(mapped)
      .onConflictDoUpdate({
        target: [schema.codeUsageDaily.date, schema.codeUsageDaily.userEmail],
        set: { ...mapped, updatedAt: sql`now()` },
      });
    rows++;
  }
  return rows;
}

function rowFromCode(row: CodeUsageRow) {
  if (row.actor?.type !== "user_actor") return null;
  const email = row.actor.email_address?.toLowerCase();
  if (!email) return null;
  const tokens = row.core_metrics?.tokens ?? {};
  const costAmount = row.core_metrics?.estimated_cost?.amount ?? 0;
  const costCurrency =
    row.core_metrics?.estimated_cost?.currency?.toUpperCase() ?? "USD";
  // The API documents cost in USD minor units (cents). Defensive coercion.
  const estimatedCostCents =
    costCurrency === "USD" ? Math.round(costAmount) : 0;

  return {
    date: row.date,
    userEmail: email,
    organizationId: row.organization_id ?? null,
    subscriptionType: row.subscription_type ?? null,
    sessions: row.num_sessions ?? 0,
    linesAdded: row.lines_of_code?.added ?? 0,
    linesAccepted: row.lines_of_code?.accepted ?? 0,
    suggestions: row.suggestions?.count ?? 0,
    accepts: row.suggestions?.accepted_count ?? 0,
    commits: row.commits_by_claude_code ?? 0,
    prs: row.pull_requests_by_claude_code ?? 0,
    tokensInput: tokens.input ?? 0,
    tokensOutput: tokens.output ?? 0,
    tokensCacheRead: tokens.cache_read ?? 0,
    tokensCacheCreation: tokens.cache_creation ?? 0,
    estimatedCostCents,
    models: row.models_used ?? null,
    terminalType: row.terminal_type ?? null,
  };
}

async function syncMessages(from: string, to: string): Promise<number> {
  let rows = 0;
  for await (const bucket of fetchMessagesUsage(from)) {
    const day = bucket.starting_at.slice(0, 10);
    if (day < from || day > to) continue;
    for (const r of bucket.results ?? []) {
      const mapped = {
        date: day,
        accountId: r.account_id ?? "",
        workspaceId: r.workspace_id ?? "",
        apiKeyId: r.api_key_id ?? "",
        model: r.model ?? "",
        serviceTier: r.service_tier ?? null,
        tokensInput: r.uncached_input_tokens ?? 0,
        tokensOutput: r.output_tokens ?? 0,
        tokensCacheRead: r.cache_read_input_tokens ?? 0,
        tokensCacheCreation: r.cache_creation_input_tokens ?? 0,
        requests: 0,
      };
      await db
        .insert(schema.messagesUsageDaily)
        .values(mapped)
        .onConflictDoUpdate({
          target: [
            schema.messagesUsageDaily.date,
            schema.messagesUsageDaily.accountId,
            schema.messagesUsageDaily.workspaceId,
            schema.messagesUsageDaily.apiKeyId,
            schema.messagesUsageDaily.model,
          ],
          set: { ...mapped, updatedAt: sql`now()` },
        });
      rows++;
    }
  }
  return rows;
}

async function syncCost(from: string, to: string): Promise<number> {
  let rows = 0;
  for await (const bucket of fetchCostReport(from)) {
    const day = bucket.starting_at.slice(0, 10);
    if (day < from || day > to) continue;
    for (const r of bucket.results ?? []) {
      const amount = Number(r.amount ?? "0");
      const mapped = {
        date: day,
        workspaceId: r.workspace_id ?? "",
        model: r.model ?? "",
        costType: r.cost_type ?? "",
        tokenType: r.token_type ?? "",
        contextWindow: r.context_window ?? "",
        serviceTier: r.service_tier ?? "",
        inferenceGeo: r.inference_geo ?? "",
        amountCents: Number.isFinite(amount) ? String(amount) : "0",
        currency: r.currency ?? "USD",
      };
      await db
        .insert(schema.costReportDaily)
        .values(mapped)
        .onConflictDoUpdate({
          target: [
            schema.costReportDaily.date,
            schema.costReportDaily.workspaceId,
            schema.costReportDaily.model,
            schema.costReportDaily.costType,
            schema.costReportDaily.tokenType,
            schema.costReportDaily.contextWindow,
            schema.costReportDaily.serviceTier,
            schema.costReportDaily.inferenceGeo,
          ],
          set: { ...mapped, updatedAt: sql`now()` },
        });
      rows++;
    }
  }
  return rows;
}

async function syncWorkspaces(): Promise<number> {
  let rows = 0;
  for await (const w of fetchWorkspaces()) {
    if (!w.id) continue;
    const mapped = {
      id: w.id,
      name: w.name ?? null,
      displayColor: w.display_color ?? null,
      archivedAt: w.archived_at ? new Date(w.archived_at) : null,
    };
    await db
      .insert(schema.workspaces)
      .values(mapped)
      .onConflictDoUpdate({
        target: [schema.workspaces.id],
        set: { ...mapped, updatedAt: sql`now()` },
      });
    rows++;
  }
  return rows;
}

async function syncUsers(): Promise<number> {
  let rows = 0;
  for await (const u of fetchUsers()) {
    const email = u.email?.toLowerCase();
    if (!email) continue;
    const seatType =
      u.seat_type === "claude_team_premium"
        ? "premium"
        : u.seat_type === "claude_team_standard"
          ? "standard"
          : null;

    // Upsert by email. If the user already exists we only overwrite seat_type
    // when the API actually returned one (so manually-set tags are kept).
    const existing = await db.query.users.findFirst({
      where: (t, { eq }) => eq(t.email, email),
    });
    if (existing) {
      const patch: Record<string, unknown> = { name: u.name ?? existing.name };
      if (seatType) patch.seatType = seatType;
      await db
        .update(schema.users)
        .set(patch)
        .where(sql`${schema.users.email} = ${email}`);
    } else {
      await db.insert(schema.users).values({
        email,
        name: u.name ?? null,
        seatType,
      });
    }
    rows++;
  }
  return rows;
}

export async function GET(req: Request) {
  if (PREVIEW) {
    return NextResponse.json(
      { ok: false, error: "sync is disabled in PREVIEW mode" },
      { status: 503 }
    );
  }
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const source = (url.searchParams.get("source") ?? "all").toLowerCase();
  const to = isoDateMinusDays(0);
  const from = isoDateMinusDays(ROLLING_DAYS);

  type SyncTarget = "code" | "messages" | "cost" | "workspaces" | "users";
  const targets: readonly SyncTarget[] =
    source === "all"
      ? (["code", "messages", "cost", "workspaces", "users"] as const)
      : [source as SyncTarget];

  // 日付レンジを持たない（全件取得型の）ソース。
  const undated = (t: SyncTarget) => t === "users" || t === "workspaces";

  const summary: Record<string, { rows: number; status: string; error?: string; ms: number }> = {};

  for (const t of targets) {
    const start = performance.now();
    try {
      let rows = 0;
      if (t === "code") rows = await syncCode(from, to);
      else if (t === "messages") rows = await syncMessages(from, to);
      else if (t === "cost") rows = await syncCost(from, to);
      else if (t === "workspaces") rows = await syncWorkspaces();
      else if (t === "users") rows = await syncUsers();
      else throw new Error(`unknown source: ${t}`);
      const ms = Math.round(performance.now() - start);
      await logSync({
        source: t,
        fromDate: undated(t) ? null : from,
        toDate: undated(t) ? null : to,
        rowsUpserted: rows,
        status: "ok",
        durationMs: ms,
      });
      summary[t] = { rows, status: "ok", ms };
    } catch (err) {
      const ms = Math.round(performance.now() - start);
      const message = err instanceof Error ? err.message : String(err);
      await logSync({
        source: t,
        fromDate: undated(t) ? null : from,
        toDate: undated(t) ? null : to,
        rowsUpserted: 0,
        status: "error",
        errorText: message,
        durationMs: ms,
      });
      summary[t] = { rows: 0, status: "error", error: message, ms };
    }
  }

  const allOk = Object.values(summary).every((s) => s.status === "ok");
  return NextResponse.json(
    { ok: allOk, range: { from, to }, summary },
    { status: allOk ? 200 : 500 }
  );
}
