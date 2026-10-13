import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isTeamCoach } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { team_id, opponent_club_name, opponent_contact, category, level, match_date, match_time, location_type, venue_address, notes } = body;
  if (!team_id || !opponent_club_name || !match_date || !location_type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!(await isTeamCoach(user.id, team_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  const { error } = await supabase.from("friendly_matches").insert({
    team_id,
    organizer_id: user.id,
    opponent_club_name,
    opponent_contact,
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
