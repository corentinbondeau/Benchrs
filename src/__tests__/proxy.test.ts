// @vitest-environment node
/**
 * Tests du proxy Next.js 16 (src/proxy.ts, ex-middleware).
 *
 * Contexte : le proxy gère, dans l'ordre, le rewrite du favicon, le bypass
 * des assets, la bascule vers un fork "legacy" pour les vieux navigateurs
 * (NEXT_PUBLIC_LEGACY_URL), puis la garde d'authentification.
 *
 * Ce fichier documente 3 bugs identifiés à l'audit, via des tests qui
 * échouent aujourd'hui (phase RED) :
 *  - Bug 1 : les routes /api/* sont redirigées vers le domaine legacy alors
 *    qu'elles devraient être exclues (CORS + perte des cookies de session).
 *  - Bug 2 : le cookie d'opt-out `force_full` n'est pas persistant ni
 *    sécurisé (pas de maxAge, sameSite, secure).
 *  - Bug 3 : couvert dans legacyUserAgent.test.ts (liste des bots trop
 *    courte), pas ici.
 *
 * Note technique : `next/server` (NextRequest/NextResponse) s'appuie sur des
 * APIs Web (Request/Response/URL) qui ne sont pas fiables en environnement
 * jsdom (environnement par défaut du projet, cf vitest.config.ts). On force
 * donc l'environnement "node" pour ce fichier via le pragma
 * `@vitest-environment node` en tête de fichier.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "../proxy";

const LEGACY_UA =
  // iOS 12 (iPhone 7 réel, Safari mobile) — même fixture que legacyUserAgent.test.ts
  "Mozilla/5.0 (iPhone; CPU iPhone OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1";

const MODERN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const LEGACY_URL = "https://legacy.benchrs.example.com";

// Cookie de session valide : utilisé pour isoler le comportement de la
// bascule legacy de celui de la garde d'authentification (qui redirige elle
// aussi en 307 vers /login si l'utilisateur n'est pas connecté). Sans cela,
// une requête "non connectée" est redirigée en 307 vers /login même quand la
// bascule legacy fonctionne correctement, ce qui rendrait les assertions
// `status !== 307` ambiguës (on ne saurait pas laquelle des deux redirections
// a été observée).
const SESSION_COOKIE = "sb-gxksycbwylhkhihcvddw-auth-token=valid-session-token";

function makeRequest(
  path: string,
  opts: { ua?: string; cookie?: string; loggedIn?: boolean } = {},
): NextRequest {
  const headers = new Headers();
  if (opts.ua) headers.set("user-agent", opts.ua);
  const cookies = [opts.loggedIn !== false ? SESSION_COOKIE : "", opts.cookie]
    .filter(Boolean)
    .join("; ");
  if (cookies) headers.set("cookie", cookies);
  return new NextRequest(new URL(path, "https://app.benchrs.example.com"), {
    headers,
  });
}

function isRedirectedToLegacy(res: Response): boolean {
  if (res.status !== 307 && res.status !== 308) return false;
  const location = res.headers.get("location");
  if (!location) return false;
  return new URL(location).host === new URL(LEGACY_URL).host;
}

describe("proxy", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_LEGACY_URL", LEGACY_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("Bug 1 — bascule legacy et routes /api/*", () => {
    // ==== CAS 1 — contrôle positif : une page normale avec UA legacy est bien redirigée ====
    // Pourquoi : sans ce contrôle positif, un test "pas de redirection sur /api"
    // pourrait passer pour une mauvaise raison (ex: bascule legacy cassée globalement).
    it("redirige une page normale (/calendar) vers le domaine legacy pour un UA ancien", () => {
      const req = makeRequest("/calendar", { ua: LEGACY_UA });
      const res = proxy(req);

      expect(isRedirectedToLegacy(res)).toBe(true);
      const location = res.headers.get("location");
      expect(location).toContain("/calendar");
    });

    // ==== CAS 2 — bug réel : une route API ne doit pas être redirigée vers le legacy ====
    // Pourquoi : un fetch('/api/...') redirigé en 307 cross-origin est bloqué par CORS
    // et perd les cookies de session ⇒ rupture fonctionnelle silencieuse côté client.
    it("ne redirige PAS /api/notifications/send vers le domaine legacy, même avec un UA ancien", () => {
      const req = makeRequest("/api/notifications/send", { ua: LEGACY_UA });
      const res = proxy(req);

      expect(isRedirectedToLegacy(res)).toBe(false);
    });
  });

  describe("Bug 2 — cookie d'opt-out force_full non persistant / non sécurisé", () => {
    // ==== CAS 3 — bug réel : le cookie posé via ?full=1 doit être persistant et sécurisé ====
    // Pourquoi : sans maxAge, le cookie est un cookie de session, perdu à la fermeture
    // du navigateur ⇒ l'utilisateur qui a explicitement demandé la version complète
    // la reperd systématiquement. sameSite/secure sont des exigences de sécurité de base.
    it("pose le cookie force_full avec maxAge, sameSite et secure quand ?full=1 est présent", () => {
      const req = makeRequest("/calendar?full=1", { ua: LEGACY_UA });
      const res = proxy(req);

      const cookie = res.cookies.get("force_full");
      expect(cookie).toBeDefined();
      expect(cookie?.maxAge).toBeTruthy();
      expect(cookie?.sameSite).toBeTruthy();
      expect(cookie?.secure).toBe(true);
    });

    // ==== CAS 4 — ?full=1 doit empêcher la bascule legacy sur la même requête ====
    // Pourquoi : c'est le contrat d'opt-out explicite documenté dans proxy.ts ;
    // s'il casse, l'utilisateur qui demande la version complète est quand même redirigé.
    it("ne redirige pas vers le legacy quand ?full=1 est présent, même avec un UA ancien", () => {
      const req = makeRequest("/calendar?full=1", { ua: LEGACY_UA });
      const res = proxy(req);

      expect(isRedirectedToLegacy(res)).toBe(false);
    });

    // ==== CAS 5 — le cookie force_full déjà posé doit empêcher la bascule legacy ====
    // Pourquoi : c'est le second mécanisme d'opt-out (persistant) ; s'il ne fonctionne
    // pas, la persistance du cookie (cas 3) ne sert à rien pour les requêtes suivantes.
    it("ne redirige pas vers le legacy quand le cookie force_full est déjà présent", () => {
      const req = makeRequest("/calendar", {
        ua: LEGACY_UA,
        cookie: "force_full=1",
      });
      const res = proxy(req);

      expect(isRedirectedToLegacy(res)).toBe(false);
    });
  });

  describe("contrôles positifs additionnels (harnais de test)", () => {
    // ==== CAS 6 — sans NEXT_PUBLIC_LEGACY_URL, jamais de bascule ====
    it("ne redirige pas vers le legacy si NEXT_PUBLIC_LEGACY_URL est absente", () => {
      vi.stubEnv("NEXT_PUBLIC_LEGACY_URL", "");
      const req = makeRequest("/calendar", { ua: LEGACY_UA });
      const res = proxy(req);

      expect(isRedirectedToLegacy(res)).toBe(false);
    });

    // ==== CAS 7 — UA moderne : pas de bascule, sert de référence de comportement normal ====
    it("ne redirige pas vers le legacy pour un UA moderne", () => {
      const req = makeRequest("/calendar", { ua: MODERN_UA });
      const res = proxy(req);

      expect(isRedirectedToLegacy(res)).toBe(false);
    });
  });
});
