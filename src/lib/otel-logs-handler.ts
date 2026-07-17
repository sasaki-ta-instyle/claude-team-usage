import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { db, schema } from "@/db/client";
import { decodeOtlpLogs } from "@/lib/otlp";

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

export async function handleOtelLogs(req: Request) {
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

  // OTel セマンティック規約に従ってドット区切りキーを優先しつつ、互換のため
  // アンダースコア版も fallback として見る。Cowork（Claude Agent SDK）の
  // 実イベント例: user.email / session.id / organization.id / prompt.id /
  // event.name / terminal.type / model / cost_usd / cost_usd_micros /
  // input_tokens / output_tokens / cache_read_tokens / cache_creation_tokens
  // / duration_ms / request_id 等。
  function pickFirst<T>(
    keys: string[],
    fn: (key: string) => T | null
  ): T | null {
    for (const k of keys) {
      const v = fn(k);
      if (v != null) return v;
    }
    return null;
  }

  const rows = records.map((r) => {
    const a = r.attributes;
    const res = r.resourceAttributes;
    const lookupStr = (k: string) =>
      pickStr(a, k) ?? pickStr(res, k);
    const lookupNum = (k: string) =>
      pickNum(a, k) ?? pickNum(res, k);

    // cost: dollars (cost_usd) or micros (cost_usd_micros)。両方あれば
    // micros の方が精度高いのでそちらを優先。
    const costMicros = a["cost_usd_micros"] ?? res["cost_usd_micros"];
    const costUsd = a["cost_usd"] ?? res["cost_usd"];
    let costCents: number | null = null;
    if (typeof costMicros === "number") costCents = Math.round(costMicros / 10_000);
    else if (typeof costUsd === "number") costCents = Math.round(costUsd * 100);

    const promptLenRaw = a["prompt_length"] ?? a["prompt.length"];
    const promptLength =
      typeof promptLenRaw === "string" && /^\d+$/.test(promptLenRaw)
        ? Number(promptLenRaw)
        : typeof promptLenRaw === "number"
          ? promptLenRaw
          : null;

    const serviceName = pickStr(res, "service.name");

    return {
      occurredAt: r.occurredAt,
      eventName: eventNameOf(a, r.body),
      userEmail: pickFirst(["user.email", "user_email"], lookupStr),
      sessionId: pickFirst(["session.id", "session_id"], lookupStr),
      organizationId: pickFirst(
        ["organization.id", "organization_id"],
        lookupStr
      ),
      promptId: pickFirst(["prompt.id", "prompt_id"], lookupStr),
      serviceName,
      model: pickFirst(["model", "gen_ai.request.model"], lookupStr),
      inputTokens: pickFirst(["input_tokens", "gen_ai.usage.input_tokens"], lookupNum),
      outputTokens: pickFirst(["output_tokens", "gen_ai.usage.output_tokens"], lookupNum),
      costUsdCents: costCents,
      durationMs: pickFirst(["duration_ms"], lookupNum),
      toolName: pickFirst(["tool_name", "tool.name"], lookupStr),
      decision: pickFirst(["decision", "source"], lookupStr),
      errorText: pickFirst(["error", "error.message"], lookupStr),
      statusCode: pickFirst(["status_code"], lookupNum),
      promptLength,
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
