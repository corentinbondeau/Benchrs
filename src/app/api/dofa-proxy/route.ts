import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/api-auth";
import { getDofaBearerToken } from "@/lib/dofa/auth";
import { rateLimit, clientKey } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const DOFA_BASE = process.env.DOFA_BASE_URL || "https://api-dofa.prd-aws.fff.fr";

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

  try {
    const token = await getDofaBearerToken();
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Benchrs Proxy) AppleWebKit/537.36",
      Accept: "application/json, application/ld+json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const url = `${DOFA_BASE}${decodedPath}`;
    const res = await fetch(url, { method: "GET", headers });

    if (!res.ok) {
      return NextResponse.json(
        { error: `DOFA returned HTTP ${res.status}` },
        { status: res.status === 403 ? 502 : res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    console.error("[dofa-proxy] error:", err);
    return NextResponse.json(
      { error: "Impossible de contacter l'API FFF" },
      { status: 502 }
    );
  }
}
