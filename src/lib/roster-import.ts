// claude.ai 管理画面「メンバー」の CSV エクスポートを users テーブルへ反映する。
// 列: "Name","Email","Role","Status","Seat Tier"（ヘッダ名で解決するので列順は問わない）
//
// 方針:
// - CSV = 組織ロスターの正本。CSV にある人は in_roster=true + seat_type を CSV 通りに。
//   CSV に無い既存行は in_roster=false + seat_type=null（行は削除しない）。
// - 不正な CSV は 1 件でも検出したら全体を reject（部分反映しない / fail-closed）。
//   特に 0 件 CSV は「全員退職」扱いになって母集団が消えるので明示的に拒否する。

import { sql } from "drizzle-orm";

import { db, schema } from "@/db/client";

export type RosterSeat = "premium" | "standard" | null;

export type RosterEntry = {
  email: string;
  name: string | null;
  role: string | null;
  status: string | null;
  seatType: RosterSeat;
};

export class RosterCsvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`CSV を取り込めません: ${problems.join(" / ")}`);
    this.name = "RosterCsvError";
  }
}

const SEAT_TIER_MAP: ReadonlyMap<string, RosterSeat> = new Map([
  ["premium", "premium"],
  ["standard", "standard"],
  ["unassigned", null],
]);

// RFC 4180 寄りの最小 CSV パーサ（引用符・"" エスケープ・引用符内改行・CRLF 対応）。
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (inQuotes) throw new RosterCsvError(["引用符が閉じていません"]);
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

// 全角スペースも含めて前後の空白を落とす
function clean(v: string | undefined): string {
  return (v ?? "").replace(/^[\s　]+|[\s　]+$/g, "");
}

export function parseRosterCsv(text: string): RosterEntry[] {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new RosterCsvError(["空のファイルです"]);

  const header = rows[0].map((h) => clean(h).toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iEmail = col("email");
  const iTier = col("seat tier");
  const iName = col("name");
  const iRole = col("role");
  const iStatus = col("status");
  const missing = [
    iEmail < 0 ? "Email" : null,
    iTier < 0 ? "Seat Tier" : null,
  ].filter((v): v is string => v !== null);
  if (missing.length) {
    throw new RosterCsvError([
      `必須列がありません: ${missing.join(", ")}（claude.ai 管理画面のメンバー CSV を指定してください）`,
    ]);
  }

  const problems: string[] = [];
  const seen = new Set<string>();
  const entries: RosterEntry[] = [];
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const email = clean(r[iEmail]).toLowerCase();
    const tierRaw = clean(r[iTier]);
    if (!email || !email.includes("@")) {
      problems.push(`${line} 行目: Email が不正（"${email}"）`);
      return;
    }
    if (seen.has(email)) {
      problems.push(`${line} 行目: Email が重複（${email}）`);
      return;
    }
    seen.add(email);
    const tierKey = tierRaw.toLowerCase();
    if (!SEAT_TIER_MAP.has(tierKey)) {
      problems.push(`${line} 行目: Seat Tier が未知の値（"${tierRaw}"）`);
      return;
    }
    entries.push({
      email,
      name: iName >= 0 ? clean(r[iName]) || null : null,
      role: iRole >= 0 ? clean(r[iRole]) || null : null,
      status: iStatus >= 0 ? clean(r[iStatus]) || null : null,
      seatType: SEAT_TIER_MAP.get(tierKey) ?? null,
    });
  });

  if (problems.length) throw new RosterCsvError(problems);
  if (entries.length === 0) {
    throw new RosterCsvError(["メンバー行が 0 件です（全員をロスター外にする取り込みは拒否します）"]);
  }
  return entries;
}

export type RosterImportResult = {
  total: number;
  counts: { premium: number; standard: number; unassigned: number };
  added: string[];
  removed: string[];
  seatChanges: Array<{ email: string; from: RosterSeat; to: RosterSeat }>;
};

function toSeat(v: string | null): RosterSeat {
  return v === "premium" || v === "standard" ? v : null;
}

export async function applyRoster(entries: RosterEntry[]): Promise<RosterImportResult> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({
        email: schema.users.email,
        seatType: schema.users.seatType,
        inRoster: schema.users.inRoster,
      })
      .from(schema.users);
    const byEmail = new Map(existing.map((u) => [u.email.toLowerCase(), u]));
    const csvEmails = new Set(entries.map((e) => e.email));

    const added: string[] = [];
    const removed: string[] = [];
    const seatChanges: RosterImportResult["seatChanges"] = [];

    for (const e of entries) {
      const prev = byEmail.get(e.email);
      const values = {
        seatType: e.seatType,
        inRoster: true,
        rosterRole: e.role,
        rosterSyncedAt: now,
        ...(e.name ? { name: e.name } : {}),
      };
      await tx
        .insert(schema.users)
        .values({ email: e.email, ...values })
        .onConflictDoUpdate({ target: schema.users.email, set: values });
      if (!prev || !prev.inRoster) added.push(e.email);
      const prevSeat = prev ? toSeat(prev.seatType) : null;
      if (prev && prevSeat !== e.seatType) {
        seatChanges.push({ email: e.email, from: prevSeat, to: e.seatType });
      }
    }

    for (const [email, u] of byEmail) {
      if (csvEmails.has(email) || (!u.inRoster && u.seatType === null)) continue;
      await tx
        .update(schema.users)
        .set({ inRoster: false, seatType: null, rosterSyncedAt: now })
        .where(sqlEmailEq(email));
      removed.push(email);
    }

    await tx.insert(schema.syncLog).values({
      source: "roster",
      rowsUpserted: entries.length,
      status: "ok",
      durationMs: Date.now() - now.getTime(),
    });

    return {
      total: entries.length,
      counts: {
        premium: entries.filter((e) => e.seatType === "premium").length,
        standard: entries.filter((e) => e.seatType === "standard").length,
        unassigned: entries.filter((e) => e.seatType === null).length,
      },
      added,
      removed,
      seatChanges,
    };
  });
}

async function logRosterError(message: string) {
  await db
    .insert(schema.syncLog)
    .values({ source: "roster", rowsUpserted: 0, status: "error", errorText: message })
    .catch(() => undefined);
}

// 入口（server action / API）共通: パース → 反映。失敗も sync_log に残す。
export async function importRosterCsv(text: string): Promise<RosterImportResult> {
  try {
    return await applyRoster(parseRosterCsv(text));
  } catch (err) {
    await logRosterError(err instanceof Error ? err.message : String(err));
    throw err;
  }
}

function sqlEmailEq(email: string) {
  return sql`lower(${schema.users.email}) = ${email}`;
}
