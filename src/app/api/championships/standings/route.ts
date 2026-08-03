import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden, isTeamMember } from "@/lib/api-auth";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();

  if (!body.championship_id) {
    return NextResponse.json({ error: "championship_id requis" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: championship } = await supabase
    .from("championships")
    .select("id, team_id")
    .eq("id", body.championship_id)
    .maybeSingle();

  if (!championship || !(await isTeamMember(user.id, championship.team_id))) {
    return forbidden();
  }

  const { data, error } = await supabase
    .from("championship_standings")
    .insert({
      championship_id: body.championship_id,
      matchday_number: body.matchday_number || null,
      home_team: body.home_team,
      away_team: body.away_team,
      home_score: body.home_score,
      away_score: body.away_score,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
