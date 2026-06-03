import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// traces もスコープ外。200 を返して捨てる。
export async function POST() {
  return NextResponse.json({ ok: true, accepted: false });
}
