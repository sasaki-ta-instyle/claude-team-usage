// 閲覧用の暗証番号（PIN）ゲート。Edge（middleware）と Node（server action）の両方から使うので
// Web Crypto のみに依存する。
//
// - PIN は env `VIEWER_PIN`（数字 4〜8 桁）。未設定・形式不正なら誰も PIN では入れない（fail-closed）
// - 正しい PIN を入れた人には cookie に "<失効時刻(unix秒)>.<HMAC-SHA256(AUTH_SECRET, "viewer-pin:" + PIN + ":" + 失効時刻)>" を渡す
//   → 失効時刻はサーバ側でも検証する（cookie 値を保存して期限後に使い回せない）
//   → PIN を変えると既存 cookie はすべて無効になる（= 全員の閲覧を一括で止められる）

export const VIEWER_COOKIE = "ctu_viewer";
export const VIEWER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 日

export function configuredPin(): string | null {
  const pin = process.env.VIEWER_PIN ?? "";
  return /^\d{4,8}$/.test(pin) ? pin : null;
}

async function sign(pin: string, exp: number): Promise<string | null> {
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
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`viewer-pin:${pin}:${exp}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

// 発行: 今から VIEWER_COOKIE_MAX_AGE 秒有効なトークン
export async function viewerToken(pin: string, nowMs = Date.now()): Promise<string | null> {
  const exp = Math.floor(nowMs / 1000) + VIEWER_COOKIE_MAX_AGE;
  const sig = await sign(pin, exp);
  return sig ? `${exp}.${sig}` : null;
}

// 長さに依存しない比較（タイミング差で一致桁を推測させない）
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function isValidViewerCookie(
  value: string | undefined,
  nowMs = Date.now()
): Promise<boolean> {
  const pin = configuredPin();
  if (!pin || !value) return false;
  const m = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(value);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp * 1000 <= nowMs) return false;
  const expected = await sign(pin, exp);
  return expected !== null && safeEqual(m[2], expected);
}

// オープンリダイレクト防止: basePath 内の相対パスだけ許可。
// 制御文字・空白・非 ASCII・バックスラッシュを拒否する（"/\t/evil.example" はブラウザがタブを除去して
// "//evil.example" と解釈するため、先頭 "//" の判定だけでは足りない）
export function safeFrom(from: string): string {
  return /^\/(?!\/)[\x21-\x7E]*$/.test(from) && !from.includes("\\") ? from : "/";
}
