import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/api-auth";
import { getDofaBearerToken } from "@/lib/dofa/auth";
import { rateLimit, clientKey } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * URLs candidates de l'API DOFA — la FFF change régulièrement de domaine.
 * On essaie dans l'ordre jusqu'à obtenir une réponse JSON valide.
 */
const DOFA_BASES = [
  process.env.DOFA_BASE_URL,
  "https://api-dofa.prd-aws.fff.fr",
  "https://api-dofa.fff.fr",
].filter(Boolean) as string[];

/**
 * Whitelist des chemins autorisés — seuls ces préfixes sont relayés.
 * Empêche l'utilisation du proxy comme open relay.
 */
const ALLOWED_PREFIXES = [
  "/api/clubs/",
  "/api/compets/",
];

function isAllowedPath(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Proxy DOFA côté serveur.
 *
 * Le navigateur ne peut pas appeler l'API DOFA directement (CORS).
 * Cette route relaie les requêtes GET en ajoutant le Bearer token.
 *
 * Usage : GET /api/dofa-proxy?path=/api/clubs/12152/equipes.json?filter=
 */
export async function GET(req: Request) {
  // Auth obligatoire — seuls les utilisateurs connectés peuvent utiliser le proxy
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  // Rate limiting : 30 appels / minute par utilisateur
  if (!rateLimit(`dofa-proxy:${clientKey(req)}`, { limit: 30, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");

  if (!path) {
    return NextResponse.json({ error: "Paramètre 'path' requis" }, { status: 400 });
  }

  // Validation du chemin — whitelist stricte
  const decodedPath = decodeURIComponent(path);
  if (!isAllowedPath(decodedPath)) {
    return NextResponse.json({ error: "Chemin non autorisé" }, { status: 403 });
  }

  const token = await getDofaBearerToken();
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "application/json, application/ld+json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let lastError: string = "Impossible de contacter l'API FFF";

  // Essaie chaque URL candidate — la FFF change régulièrement de domaine
  for (const base of DOFA_BASES) {
    const url = `${base}${decodedPath}`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(10_000),
      });

      // Vérifier que la réponse est du JSON et non une page HTML d'erreur FFF
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || contentType.includes("text/html")) {
        lastError = `L'API FFF est temporairement indisponible (HTTP ${res.status} sur ${new URL(url).hostname}). La FFF coupe régulièrement son API — réessayez plus tard.`;
        continue; // Essayer le domaine suivant
      }

      const data = await res.json();
      return NextResponse.json(data, {
        headers: { "Cache-Control": "private, max-age=60" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[dofa-proxy] ${base} failed:`, msg);
      lastError = `L'API FFF est injoignable (${new URL(base).hostname}). La FFF coupe régulièrement son API — réessayez plus tard.`;
      continue; // Essayer le domaine suivant
    }
  }

  // Aucun domaine n'a fonctionné
  return NextResponse.json({ error: lastError }, { status: 502 });
}
