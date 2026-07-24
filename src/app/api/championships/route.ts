import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("team_id");

  const supabase = createAdminClient();
  let query = supabase
    .from("championships")
    .select("*")
    .order("created_at", { ascending: false });

  if (teamId) {
    query = query.eq("team_id", teamId);
  }

  const { data: championships } = await query;

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
  const supabase = createAdminClient();
  const body = await req.json();

  const { data, error } = await supabase
    .from("championships")
    .insert({
      name: body.name,
      season: body.season,
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
