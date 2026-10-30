import { NextResponse } from "next/server";
import { getAuthUser, unauthorized, forbidden, getTeamRole } from "@/lib/api-auth";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { generateCoachInsights, type CoachInsightsData } from "@/lib/insights/coach-insights";

// Cache mémoire serveur avec TTL de 5 minutes
interface CacheEntry {
  data: CoachInsightsData;
  expiresAt: number;
}

const insightsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

function getCached(teamId: string): CoachInsightsData | null {
  const entry = insightsCache.get(teamId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    insightsCache.delete(teamId);
    return null;
  }
  return entry.data;
}

function setCached(teamId: string, data: CoachInsightsData) {
  insightsCache.set(teamId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function GET(req: Request) {
  // Rate limit : 10 req/min par IP
  const key = `insights:coach:${clientKey(req)}`;
  if (!rateLimit(key, { limit: 10, windowMs: 60_000 })) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez dans une minute." },
      { status: 429 }
    );
  }

  // Authentification
  const user = await getAuthUser(req);
  if (!user) return unauthorized("Token manquant ou invalide");

  // Paramètre teamId
  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json(
      { error: "Paramètre teamId manquant" },
      { status: 400 }
    );
  }

  // Vérification du rôle : coach ou owner uniquement
  const role = await getTeamRole(user.id, teamId);
  if (role !== "coach" && role !== "owner") {
    return forbidden();
  }

  // Cache hit
  const cached = getCached(teamId);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT" },
    });
  }

  // Génération des insights
  const insights = await generateCoachInsights(teamId);
  setCached(teamId, insights);

  return NextResponse.json(insights, {
    headers: { "X-Cache": "MISS" },
  });
}
