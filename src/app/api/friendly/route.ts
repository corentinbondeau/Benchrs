import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isTeamCoach } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { team_id, category, level, match_date, match_time, location_type, venue_address, notes } = body;
  // L'adversaire est inconnu à la création (c'est l'objet de l'annonce).
  if (!team_id || !match_date || !location_type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!(await isTeamCoach(user.id, team_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  const { error } = await supabase.from("friendly_matches").insert({
    team_id,
    organizer_id: user.id,
    category,
    level,
    match_date,
    match_time,
    location_type,
    venue_address,
    notes,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
