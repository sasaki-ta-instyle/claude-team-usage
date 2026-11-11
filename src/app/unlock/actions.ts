"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  VIEWER_COOKIE,
  VIEWER_COOKIE_MAX_AGE,
  configuredPin,
  safeFrom,
  safeEqual,
  viewerToken,
} from "@/lib/viewer-pass";

export type UnlockState = { error: string | null };

// 総当たり対策: IP ごとに 10 分で 5 回まで失敗可、超えたら 10 分ロック。
// PM2 は fork 1 プロセスなのでプロセス内 Map で足りる（再起動でリセットされる）。
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, { count: number; first: number }>();

function clientIp(h: Headers): string {
  return (
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function isLocked(ip: string, now: number): boolean {
  const f = failures.get(ip);
  if (!f) return false;
  if (now - f.first > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return f.count >= MAX_FAILURES;
}

function recordFailure(ip: string, now: number) {
  const f = failures.get(ip);
  if (!f || now - f.first > WINDOW_MS) failures.set(ip, { count: 1, first: now });
  else f.count++;
}

export async function unlock(_prev: UnlockState, formData: FormData): Promise<UnlockState> {
  const pin = configuredPin();
  if (!pin) {
    return { error: "暗証番号がサーバに設定されていません。管理者に連絡してください。" };
  }
  const ip = clientIp(await headers());
  const now = Date.now();
  if (isLocked(ip, now)) {
    return { error: "入力ミスが続いたため 10 分間ロックしています。時間をおいて再度お試しください。" };
  }

  const input = String(formData.get("pin") ?? "").trim();
  if (!safeEqual(input, pin)) {
    recordFailure(ip, now);
    await new Promise((r) => setTimeout(r, 500)); // 連打の速度を落とす
    return { error: "暗証番号が違います。" };
  }
  failures.delete(ip);

  const token = await viewerToken(pin);
  if (!token) return { error: "サーバ設定（AUTH_SECRET）が不足しています。管理者に連絡してください。" };
  (await cookies()).set(VIEWER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/claude-team-usage",
    maxAge: VIEWER_COOKIE_MAX_AGE,
  });
  redirect(safeFrom(String(formData.get("from") ?? "/")));
}
