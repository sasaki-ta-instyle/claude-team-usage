// 閲覧用の暗証番号（PIN）ゲート。Edge（middleware）と Node（server action）の両方から使うので
// Web Crypto のみに依存する。
//
// - PIN は env `VIEWER_PIN`（数字 4〜8 桁）。未設定・形式不正なら誰も PIN では入れない（fail-closed）
// - 正しい PIN を入れた人には cookie に HMAC-SHA256(AUTH_SECRET, "viewer-pin:" + PIN) を渡す
//   → PIN を変えると既存 cookie はすべて無効になる（= 全員の閲覧を一括で止められる）

export const VIEWER_COOKIE = "ctu_viewer";
export const VIEWER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 日

export function configuredPin(): string | null {
  const pin = process.env.VIEWER_PIN ?? "";
  return /^\d{4,8}$/.test(pin) ? pin : null;
}

export async function viewerToken(pin: string): Promise<string | null> {
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`viewer-pin:${pin}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

// 長さに依存しない比較（タイミング差で一致桁を推測させない）
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function isValidViewerCookie(value: string | undefined): Promise<boolean> {
  const pin = configuredPin();
  if (!pin || !value) return false;
  const expected = await viewerToken(pin);
  return expected !== null && safeEqual(value, expected);
}
