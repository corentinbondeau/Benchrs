import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isLegacyUserAgent } from "./lib/legacy/ua";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/favicon.ico") {
    return NextResponse.rewrite(new URL("/favicon.png", request.url));
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

  // Fallback legacy : les navigateurs/OS anciens (iPhone 7 / iOS ancien, vieux
  // Android/WebView) ne peuvent pas exécuter le bundle Next.js moderne et
  // obtiennent une page blanche. On les redirige vers /legacy (HTML/CSS vanilla).
  // Opt-out : ?full=1 (pose le cookie force_full) ou cookie force_full déjà posé.
  const ua = request.headers.get("user-agent") ?? "";
  const forceFullParam = request.nextUrl.searchParams.get("full") === "1";
  const forceFullCookie = !!request.cookies.get("force_full");
  const isForceFull = forceFullParam || forceFullCookie;

  const withForceFullCookie = (response: NextResponse) => {
    if (forceFullParam) {
      response.cookies.set("force_full", "1", { path: "/" });
    }
    return response;
  };

  // Anti-boucle : on ne redirige jamais si on est déjà sous /legacy.
  if (!isForceFull && isLegacyUserAgent(ua) && !pathname.startsWith("/legacy")) {
    return withForceFullCookie(NextResponse.redirect(new URL("/legacy", request.url)));
  }

  const isAuthPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password";
  const isPublicPage =
    pathname === "/create-team" ||
    pathname === "/join" ||
    pathname === "/offline" ||
    pathname.startsWith("/live/") ||
    pathname.startsWith("/c/") ||
    // /legacy et ses sous-routes sont publiques (login/register accessibles
    // sans session) ; chaque handler legacy gère lui-même l'auth.
    pathname.startsWith("/legacy");
  const isApiAuth = pathname.startsWith("/api/auth");
  // /api/notifications/cron est appelé par Vercel Cron (Bearer CRON_SECRET) sans session,
  // et /api/clubs/lookup-public est appelé depuis la page publique /register.
  const isPublicApi =
    pathname.startsWith("/api/live/") ||
    pathname.startsWith("/api/calendar/ics") ||
    pathname === "/api/notifications/cron" ||
    pathname === "/api/clubs/lookup-public";

  const sessionToken =
    request.cookies.get("sb-gxksycbwylhkhihcvddw-auth-token")?.value;

  const isLoggedIn = !!sessionToken;

  if (isApiAuth || isPublicApi) {
    return withForceFullCookie(NextResponse.next());
  }

  if (isAuthPage) {
    if (isLoggedIn) {
      return withForceFullCookie(NextResponse.redirect(new URL("/", request.url)));
    }
    return withForceFullCookie(NextResponse.next());
  }

  if (isPublicPage) {
    return withForceFullCookie(NextResponse.next());
  }

  if (!isLoggedIn) {
    return withForceFullCookie(NextResponse.redirect(new URL("/login", request.url)));
  }

  return withForceFullCookie(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|public|reset-password).*)"],
};
