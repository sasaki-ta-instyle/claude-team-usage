import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

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

function buildLoginRedirect(req: NextRequest, fromPath: string) {
  // Build the public-facing URL from forwarded headers. req.nextUrl is
  // unreliable behind nginx (host comes through as 127.0.0.1:3011) and
  // setting `${BASE_PATH}/login` on it double-prefixes basePath. We
  // construct an absolute URL ourselves with the public host.
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (req.nextUrl.protocol.replace(":", "") || "https");
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    req.nextUrl.host;
  const target = new URL(`${proto}://${host}${BASE_PATH}/login`);
  target.searchParams.set("from", fromPath);
  return NextResponse.redirect(target);
}

function clearStaleSession(res: NextResponse) {
  // Stale cookies (signed with a different AUTH_SECRET) cause JWT decode to
  // throw. Remove them so the next request starts cleanly.
  res.cookies.delete("__Secure-authjs.session-token");
  res.cookies.delete("authjs.session-token");
  res.cookies.delete("__Secure-authjs.callback-url");
  res.cookies.delete("authjs.callback-url");
  res.cookies.delete("__Host-authjs.csrf-token");
  res.cookies.delete("authjs.csrf-token");
  return res;
}

export default async function middleware(req: NextRequest) {
  if (PREVIEW) return NextResponse.next();

  const path = stripBase(req.nextUrl.pathname);
  if (PUBLIC.some((re) => re.test(path))) return NextResponse.next();

  // Decode JWT directly so we can catch decode errors (stale AUTH_SECRET).
  let isAdmin = false;
  let decodeFailed = false;
  try {
    const token = await getToken({
      req,
      secret: process.env.AUTH_SECRET,
      secureCookie: req.nextUrl.protocol === "https:",
    });
    isAdmin = Boolean(
      (token as { isAdmin?: boolean } | null | undefined)?.isAdmin
    );
  } catch {
    decodeFailed = true;
  }

  if (isAdmin) return NextResponse.next();

  const res = buildLoginRedirect(req, path);
  if (decodeFailed) clearStaleSession(res);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif|woff2?|ttf|css|js|map)$).*)",
  ],
};
