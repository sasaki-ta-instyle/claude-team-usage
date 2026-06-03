import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { db, schema } from "@/db/client";
import { decodeOtlpLogs } from "@/lib/otlp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function expectedAuthHeader(): string | null {
  const v = process.env.COWORK_OTEL_AUTH;
  if (!v || v.trim() === "") return null;
  return v.trim();
}

function constantTimeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function pickStr(attrs: Record<string, unknown>, key: string): string | null {
  const v = attrs[key];
  return typeof v === "string" ? v : null;
}
function pickNum(attrs: Record<string, unknown>, key: string): number | null {
  const v = attrs[key];
  return typeof v === "number" ? Math.round(v) : null;
}

function eventNameOf(attrs: Record<string, unknown>, body: string | null): string {
  return (
    pickStr(attrs, "event.name") ??
    pickStr(attrs, "event_name") ??
    body ??
    "unknown"
  );
}

export async function POST(req: Request) {
  const expected = expectedAuthHeader();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "OTLP endpoint not configured (COWORK_OTEL_AUTH unset)" },
      { status: 503 }
    );
  }
  const got = req.headers.get("authorization") ?? "";
  if (!constantTimeEquals(got, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("protobuf")) {
    return NextResponse.json(
      { ok: false, error: `unsupported content-type: ${ct}` },
      { status: 415 }
    );
  }

  const raw = new Uint8Array(await req.arrayBuffer());
  let records;
  try {
    records = decodeOtlpLogs(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `decode failed: ${msg}` },
      { status: 400 }
    );
  }

  if (records.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  const rows = records.map((r) => {
    const a = r.attributes;
    const cost = a["cost_usd"];
    const costCents =
      typeof cost === "number" ? Math.round(cost * 100) : null;
    return {
      occurredAt: r.occurredAt,
      eventName: eventNameOf(a, r.body),
      userEmail: pickStr(a, "user_email") ?? pickStr(r.resourceAttributes, "user_email"),
      sessionId: pickStr(a, "session_id"),
      organizationId:
        pickStr(a, "organization_id") ?? pickStr(r.resourceAttributes, "organization_id"),
      promptId: pickStr(a, "prompt.id") ?? pickStr(a, "prompt_id"),
      model: pickStr(a, "model"),
      inputTokens: pickNum(a, "input_tokens"),
      outputTokens: pickNum(a, "output_tokens"),
      costUsdCents: costCents,
      durationMs: pickNum(a, "duration_ms"),
      toolName: pickStr(a, "tool_name"),
      decision: pickStr(a, "decision") ?? pickStr(a, "source"),
      errorText: pickStr(a, "error"),
      statusCode: pickNum(a, "status_code"),
      promptLength: pickNum(a, "prompt_length"),
      raw: { attrs: a, resource: r.resourceAttributes, body: r.body },
    };
  });

  // Insert in chunks to keep parameter count under Postgres' 65535 cap.
  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db.insert(schema.coworkEvents).values(slice);
    inserted += slice.length;
  }

  return NextResponse.json({ ok: true, inserted });
}
