import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cowork の OTel exporter は logs と一緒に metrics / traces にも POST する。
// このダッシュボードは metrics を扱わないので、200 で受け取って捨てる
// （exporter がリトライ続けるのを防ぐ）。
export async function POST() {
  return NextResponse.json({ ok: true, accepted: false });
}
