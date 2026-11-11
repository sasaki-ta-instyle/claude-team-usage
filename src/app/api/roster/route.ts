import { NextResponse } from "next/server";

import { PREVIEW } from "@/lib/preview";
import { RosterCsvError, importRosterCsv } from "@/lib/roster-import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// claude.ai 管理画面のメンバー CSV を本文（text/csv）で POST するとロスターを反映する。
// /members のアップロードフォームと同じ処理（src/lib/roster-import.ts）。
//   curl -X POST -H "Authorization: Bearer $SYNC_TOKEN" -H "Content-Type: text/csv" \
//     --data-binary @members.csv https://app.instyle.group/claude-team-usage/api/roster

function checkAuth(req: Request): boolean {
  const token = process.env.SYNC_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${token}`;
}

export async function POST(req: Request) {
  if (PREVIEW) {
    return NextResponse.json(
      { ok: false, error: "roster import is disabled in PREVIEW mode" },
      { status: 503 }
    );
  }
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const text = await req.text();
  try {
    const result = await importRosterCsv(text);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof RosterCsvError) {
      return NextResponse.json({ ok: false, problems: err.problems }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
