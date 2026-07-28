import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/favicon.ico") {
    return NextResponse.rewrite(new URL("/favicon.svg", request.url));
  }

  const isAsset =
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/logo.svg") ||
    pathname.startsWith("/favicon") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js";

  if (isAsset) {
    return NextResponse.next();
  }

  const isAuthPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password";
  const isPublicPage =
    pathname === "/create-team" ||
    pathname === "/join";
  const isApiAuth = pathname.startsWith("/api/auth");

  const sessionToken =
    request.cookies.get("sb-gxksycbwylhkhihcvddw-auth-token")?.value;

  const isLoggedIn = !!sessionToken;

  if (isApiAuth) {
    return NextResponse.next();
  }

  if (isAuthPage) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (isPublicPage) {
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|public|reset-password).*)"],
};
