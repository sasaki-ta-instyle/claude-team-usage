import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { VIEWER_COOKIE, isValidViewerCookie } from "@/lib/viewer-pass";

// 閲覧: 暗証番号（VIEWER_PIN）を入れた人 or 管理者ログイン済みの人。
// 書き込み（ロスター CSV 取り込み / tier 編集）: 管理者のみ（各 server action でも検査）。
// API は各ハンドラの Bearer / Basic 認証で守るので、ここでは素通しする。
// 全レスポンスに X-Robots-Tag を付けて検索エンジンに載せない。

const BASE_PATH = "/claude-team-usage";

function stripBase(pathname: string): string {
  if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
    const rest = pathname.slice(BASE_PATH.length);
    return rest === "" ? "/" : rest;
  }
  return pathname;
}

const PUBLIC = [
  /^\/unlock$/, // 暗証番号入力
  /^\/login$/, // 管理者ログイン
  /^\/api\/auth(\/|$)/,
  /^\/api\/sync(\/|$)/, // Bearer SYNC_TOKEN
  /^\/api\/report(\/|$)/, // Bearer SYNC_TOKEN
  /^\/api\/roster$/, // Bearer SYNC_TOKEN
  /^\/api\/health$/,
  /^\/api\/otel(\/|$)/, // Basic COWORK_OTEL_AUTH
];

const PREVIEW = process.env.PREVIEW === "1";

function withNoindex(res: NextResponse) {
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return res;
}

function redirectToUnlock(req: NextRequest, fromPath: string) {
  // req.nextUrl は nginx 越しだと host が 127.0.0.1:3011 になり、basePath も二重付与されるので
  // forwarded ヘッダから公開 URL を組み立てる。
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (req.nextUrl.protocol.replace(":", "") || "https");
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const target = new URL(`${proto}://${host}${BASE_PATH}/unlock`);
  if (fromPath !== "/") target.searchParams.set("from", fromPath + req.nextUrl.search);
  return withNoindex(NextResponse.redirect(target));
}

async function isAdmin(req: NextRequest): Promise<boolean> {
  try {
    const token = await getToken({
      req,
      secret: process.env.AUTH_SECRET,
      secureCookie: req.nextUrl.protocol === "https:",
    });
    return Boolean((token as { isAdmin?: boolean } | null | undefined)?.isAdmin);
  } catch {
    return false; // stale JWT（旧 AUTH_SECRET 署名）は未ログイン扱い
  }
}

export default async function middleware(req: NextRequest) {
  if (PREVIEW) return withNoindex(NextResponse.next());

  const path = stripBase(req.nextUrl.pathname);
  if (PUBLIC.some((re) => re.test(path))) return withNoindex(NextResponse.next());

  if (await isValidViewerCookie(req.cookies.get(VIEWER_COOKIE)?.value)) {
    return withNoindex(NextResponse.next());
  }
  if (await isAdmin(req)) return withNoindex(NextResponse.next());

  return redirectToUnlock(req, path);
}

export const config = {
  matcher: [
    // basePath 直下（/claude-team-usage、末尾スラッシュなし）は下のパターンに一致しないので明示する
    "/",
    "/((?!_next/|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif|woff2?|ttf|css|js|map)$).*)",
  ],
};
