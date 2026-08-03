import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden, isTeamMember } from "@/lib/api-auth";

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("team_id");

  if (!teamId || !(await isTeamMember(user.id, teamId))) {
    return forbidden();
  }

  const supabase = createAdminClient();
  const { data: championships } = await supabase
    .from("championships")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (!championships) {
    return NextResponse.json([]);
  }

  const results = await Promise.all(
    championships.map(async (c) => {
      const { data: teams } = await supabase
        .from("championship_standings")
        .select("*")
        .eq("championship_id", c.id);

      return { ...c, teams: teams || [] };
    })
  );

  return NextResponse.json(results);
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();

  if (!body.team_id || !(await isTeamMember(user.id, body.team_id))) {
    return forbidden();
  }

  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 200) {
    return NextResponse.json({ error: "Nom invalide" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("championships")
    .insert({
      name: body.name.trim(),
      season: body.season || null,
      level: body.level || null,
      team_id: body.team_id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
