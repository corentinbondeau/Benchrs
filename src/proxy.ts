import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isLegacyUserAgent } from "./lib/legacyUserAgent";

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

  // Bascule vers le fork legacy : les navigateurs/OS anciens (iPhone 7 / iOS
  // ancien, vieux Android/WebView) ne peuvent pas exécuter le bundle moderne
  // (Next 16 / React 19 / Tailwind 4) et obtiennent une page blanche. On les
  // redirige vers le fork downgradé (legacy-app, Next 14 / React 18 / TW3),
  // déployé séparément, dont l'URL est fournie par NEXT_PUBLIC_LEGACY_URL.
  // Opt-out : ?full=1 (pose le cookie force_full) ou cookie force_full déjà posé.
  const ua = request.headers.get("user-agent") ?? "";
  const forceFullParam = request.nextUrl.searchParams.get("full") === "1";
  const forceFullCookie = !!request.cookies.get("force_full");
  const isForceFull = forceFullParam || forceFullCookie;

  const withForceFullCookie = (response: NextResponse) => {
    if (forceFullParam) {
      // maxAge : 1 an. L'utilisateur a fait un choix explicite et délibéré
      // (?full=1) ; ce choix doit survivre bien au-delà d'une simple session
      // de navigateur, sans pour autant être "éternel" (permet de reproposer
      // le fork legacy après une longue absence, ex. suite à une amélioration
      // de compatibilité du bundle moderne).
      // sameSite: "lax" : compatible avec une arrivée depuis un lien externe
      // (le cookie est envoyé sur une navigation top-level GET initiée par un
      // lien tiers), tout en bloquant les requêtes cross-site plus risquées.
      // secure : le site est servi en HTTPS en production ; on ne le force
      // que si la requête elle-même est en HTTPS, pour ne pas casser le
      // développement local en HTTP (où le navigateur rejetterait un cookie
      // secure). On se base sur le protocole de la requête, pas sur NODE_ENV.
      response.cookies.set("force_full", "1", {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
      });
    }
    return response;
  };

  const isApiRoute = pathname.startsWith("/api/");

  // URL du fork legacy (déploiement séparé). Non défini ⇒ pas de bascille.
  const legacyUrl = process.env.NEXT_PUBLIC_LEGACY_URL;

  if (!isApiRoute && !isForceFull && legacyUrl && isLegacyUserAgent(ua)) {
    // Anti-boucle : ne pas rediriger si on est déjà sur le host du fork.
    let alreadyOnLegacy = false;
    try {
      const legacyHost = new URL(legacyUrl).host;
      alreadyOnLegacy = request.nextUrl.host === legacyHost;
    } catch {
      alreadyOnLegacy = false;
    }

    if (!alreadyOnLegacy) {
      // Préserver le chemin + la query pour arriver sur la même page côté fork.
      const target = new URL(legacyUrl);
      target.pathname = pathname;
      target.search = request.nextUrl.search;
      return withForceFullCookie(NextResponse.redirect(target));
    }
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
    pathname.startsWith("/c/");
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
