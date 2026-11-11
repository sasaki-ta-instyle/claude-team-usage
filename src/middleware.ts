import { NextResponse } from "next/server";

// ダッシュボードは公開（ログイン不要で閲覧可）。書き込み系は各 server action
// （isAdminViewer / auth）と API の Bearer 認証で個別に守る。
// 公開 URL でも検索エンジンには載せない: HTML 以外（API の JSON 等）も含めて
// 全レスポンスに X-Robots-Tag を付ける（HTML は layout の robots meta と二重）。
export default function middleware() {
  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif|woff2?|ttf|css|js|map)$).*)",
  ],
};
