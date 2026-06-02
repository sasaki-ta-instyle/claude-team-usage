import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC = [
  /^\/login$/,
  /^\/api\/auth(\/|$)/,
  /^\/api\/sync(\/|$)/,
  /^\/api\/health$/,
];

const PREVIEW = process.env.PREVIEW === "1";

export default auth((req) => {
  // Demo mode skips auth entirely. Never enable on the production host.
  if (PREVIEW) return NextResponse.next();

  const path = req.nextUrl.pathname;
  if (PUBLIC.some((re) => re.test(path))) return;

  const user = req.auth?.user as { isAdmin?: boolean } | undefined;
  if (user?.isAdmin) return;

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", path);
  return Response.redirect(url);
});

export const config = {
  matcher: [
    "/((?!_next/|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif|woff2?|ttf|css|js|map)$).*)",
  ],
};
