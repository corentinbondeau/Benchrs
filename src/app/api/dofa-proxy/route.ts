import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/api-auth";
import { rateLimit, clientKey } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Edge Runtime — les fonctions Edge tournent sur le CDN (Cloudflare/Vercel Edge)
 * avec des IP non-datacenter, ce qui évite le blocage Akamai WAF de la FFF
 * qui cible les IP AWS/GCP/Azure.
 */
export const runtime = "edge";

/**
 * URLs candidates de l'API DOFA — la FFF change régulièrement de domaine.
 * On essaie dans l'ordre jusqu'à obtenir une réponse JSON valide.
 */
const DOFA_BASES = [
  process.env.DOFA_BASE_URL,
  "https://api-dofa.fff.fr",
  "https://api-dofa.prd-aws.fff.fr",
].filter(Boolean) as string[];

/**
 * Whitelist des chemins autorisés — seuls ces préfixes sont relayés.
 * Empêche l'utilisation du proxy comme open relay.
 */
const ALLOWED_PREFIXES = ["/api/clubs/", "/api/compets/"];

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

  // Headers Chrome complets — le WAF Akamai de la FFF bloque les requêtes
  // sans fingerprint navigateur (Sec-Ch-Ua, Origin fff.fr, Sec-Fetch-*).
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    Accept: "application/ld+json, application/json",
    "Accept-Language": "fr-FR,fr;q=0.9",
    Origin: "https://www.fff.fr",
    Referer: "https://www.fff.fr/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "Sec-Ch-Ua": '"Chromium";v="130", "Google Chrome";v="130"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
  };

  // Bearer token optionnel (certains endpoints l'exigent pour les feuilles de match)
  const tokenEnv = process.env.DOFA_BEARER_TOKEN;
  if (tokenEnv) {
    headers["Authorization"] = `Bearer ${tokenEnv}`;
  }

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
