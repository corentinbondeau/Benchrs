import { NextResponse } from "next/server";
import { getAuthUser, forbidden, isTeamMember } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OSRM = "https://router.project-osrm.org/route/v1/driving";

async function geocode(query: string): Promise<{ lat: number; lon: number } | null> {
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Benchrs (gestion-equipe-football)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { lat?: string; lon?: string }[];
  const first = data?.[0];
  if (!first || !first.lat || !first.lon) return null;
  return { lat: parseFloat(first.lat), lon: parseFloat(first.lon) };
}

async function travelDuration(
  origin: { lat: number; lon: number },
  dest: { lat: number; lon: number }
): Promise<number | null> {
  const url = `${OSRM}/${origin.lon},${origin.lat};${dest.lon},${dest.lat}?overview=false`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    routes?: { duration?: number }[];
  };
  const duration = data.routes?.[0]?.duration;
  if (duration == null) return null;
  return Math.max(1, Math.round(duration / 60));
}

export async function POST(req: Request) {
  const { teamId, destination, origin } = (await req.json().catch(() => ({}))) as {
    teamId?: string;
    destination?: string;
    origin?: string;
  };

  if (!teamId || !destination || !destination.trim()) {
    return NextResponse.json({ error: "teamId et destination requis" }, { status: 400 });
  }

  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!(await isTeamMember(user.id, teamId))) {
    return forbidden();
  }

  const supabase = createAdminClient();
  const originAddr = (origin || "").trim() || null;
  let homeLocation = originAddr;

  if (!homeLocation) {
    const { data: team } = await supabase
      .from("teams")
      .select("home_location")
      .eq("id", teamId)
      .maybeSingle();
    homeLocation = (team as { home_location: string | null } | null)?.home_location ?? null;
  }

  if (!homeLocation) {
    return NextResponse.json(
      { error: "Aucun lieu d'attache défini pour l'équipe", minutes: null },
      { status: 422 }
    );
  }

  const [originGeom, destGeom] = await Promise.all([
    geocode(homeLocation),
    geocode(destination.trim()),
  ]);
  if (!originGeom || !destGeom) {
    return NextResponse.json(
      { error: "Impossible de géolocaliser les adresses", minutes: null },
      { status: 422 }
    );
  }

  const minutes = await travelDuration(originGeom, destGeom);
  if (minutes == null) {
    return NextResponse.json(
      { error: "Impossible de calculer l'itinéraire", minutes: null },
      { status: 422 }
    );
  }

  return NextResponse.json({ minutes, origin: homeLocation });
}
