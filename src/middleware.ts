import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

// Next.js 15 middleware では req.nextUrl.pathname が basePath 込みで来るため
// 明示的にストリップしてからマッチングする。
const BASE_PATH = "/claude-team-usage";

function stripBase(pathname: string): string {
  if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
    const rest = pathname.slice(BASE_PATH.length);
    return rest === "" ? "/" : rest;
  }
  return pathname;
}

const PUBLIC = [
  /^\/login$/,
  /^\/api\/auth(\/|$)/,
  /^\/api\/sync(\/|$)/,
  /^\/api\/health$/,
];

const PREVIEW = process.env.PREVIEW === "1";

export default auth((req) => {
  if (PREVIEW) return NextResponse.next();

  const path = stripBase(req.nextUrl.pathname);
  if (PUBLIC.some((re) => re.test(path))) return;

  const user = req.auth?.user as { isAdmin?: boolean } | undefined;
  if (user?.isAdmin) return;

  // Redirect to login. basePath を含めた絶対 URL を組み立てる。
  const url = new URL(req.url);
  url.pathname = `${BASE_PATH}/login`;
  url.search = "";
  url.searchParams.set("from", path);
  return Response.redirect(url);
});

export const config = {
  matcher: [
    "/((?!_next/|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif|woff2?|ttf|css|js|map)$).*)",
  ],
};
