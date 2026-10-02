import { NextResponse, type NextRequest } from "next/server";
import {
  ROLE_HOME,
  canAccess,
  isGuestOnlyPath,
  isProtectedPath,
} from "@/lib/auth/access";
import { SESSION_COOKIE, readSessionClaims } from "@/lib/auth/session-token";

/**
 * Server-side route guard. Runs before any page renders:
 *   1. No valid session + protected route  → /login?next=…
 *   2. Valid session + guest-only route     → own dashboard
 *   3. Valid session + /dashboard           → own dashboard
 *   4. Valid session + another role's route → /unauthorized (403)
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const claims = await readSessionClaims(request.cookies.get(SESSION_COOKIE)?.value);

  if (!claims) {
    if (isProtectedPath(pathname)) {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", `${pathname}${search}`);
      const res = NextResponse.redirect(url);
      // Drop an expired/invalid cookie so it is not re-sent.
      if (request.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    return NextResponse.next();
  }

  if (isGuestOnlyPath(pathname) || pathname === "/dashboard") {
    return NextResponse.redirect(new URL(ROLE_HOME[claims.role], request.url));
  }

  if (isProtectedPath(pathname) && !canAccess(claims.role, pathname)) {
    const url = new URL("/unauthorized", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt)$).*)"],
};
