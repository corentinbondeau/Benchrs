import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/api-auth";
import { rateLimit, clientKey } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Force la région Paris (cdg1) — les IP européennes sont moins bloquées par Akamai FFF */
export const preferredRegion = "cdg1";

/**
 * Le proxy Scaleway (IP non bloquée par la FFF) relaye vers l'API DOFA.
 * En fallback, on essaie l'API DOFA directement (bloqué depuis Vercel mais on tente).
 */
const DOFA_BASES = [
  process.env.DOFA_PROXY_URL || "http://51.15.108.73:3456",
  "https://api-dofa.fff.fr",
].filter(Boolean) as string[];

/**
 * Whitelist des chemins autorisés — seuls ces préfixes sont relayés.
 * Empêche l'utilisation du proxy comme open relay.
 */
const ALLOWED_PREFIXES = ["/api/clubs", "/api/compets/"];

function isAllowedPath(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Proxy DOFA côté serveur (Edge Runtime).
 *
 * Le navigateur ne peut pas appeler l'API DOFA directement (CORS).
 * Cette route relaie les requêtes GET avec les headers Chrome complets
 * nécessaires pour passer le WAF Akamai de la FFF.
 *
 * Usage : GET /api/dofa-proxy?path=/api/clubs/12152/equipes
 */
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  if (!rateLimit(`dofa-proxy:${clientKey(req)}`, { limit: 30, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");

  if (!path) {
    return NextResponse.json({ error: "Paramètre 'path' requis" }, { status: 400 });
  }

  const decodedPath = decodeURIComponent(path);
  if (!isAllowedPath(decodedPath)) {
    return NextResponse.json({ error: "Chemin non autorisé" }, { status: 403 });
  }

  // Pas de headers spéciaux nécessaires : le premier proxy (Scaleway)
  // ajoute lui-même les headers Chrome. Pour le fallback direct DOFA,
  // on ajoute les headers nécessaires.
  const headers: Record<string, string> = {
    Accept: "application/json, application/ld+json",
  };

  let lastError = "Impossible de contacter l'API FFF";

  for (const base of DOFA_BASES) {
    const url = `${base}${decodedPath}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const contentType = res.headers.get("content-type") || "";

      // La FFF renvoie une page HTML d'erreur au lieu de JSON quand elle bloque
      if (!res.ok || contentType.includes("text/html")) {
        lastError = `L'API FFF a répondu HTTP ${res.status} (${new URL(base).hostname}). Réessayez plus tard.`;
        continue;
      }

      const data = await res.json();
      return NextResponse.json(data, {
        headers: { "Cache-Control": "private, max-age=60" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[dofa-proxy] ${base} failed:`, msg);
      if (msg.includes("abort")) {
        lastError = `L'API FFF n'a pas répondu dans les 10s (${new URL(base).hostname}). Réessayez.`;
      } else {
        lastError = `L'API FFF est injoignable (${new URL(base).hostname}). Réessayez plus tard.`;
      }
      continue;
    }
  }

  return NextResponse.json({ error: lastError }, { status: 502 });
}
