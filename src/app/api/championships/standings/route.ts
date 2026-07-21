import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const supabase = createAdminClient();
  const body = await req.json();

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
