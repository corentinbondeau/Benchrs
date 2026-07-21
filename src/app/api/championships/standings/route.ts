import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "coach") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = await req.json();
  const { championship_id, matchday_number, home_team, away_team, home_score, away_score } = body;

  if (!championship_id || !home_team || !away_team || home_score === undefined || away_score === undefined) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }

  const supabase = await createClient();

  // Upsert or create matchday
  if (matchday_number) {
    await supabase.from("matchdays").upsert({
      championship_id,
      number: matchday_number,
      played_at: new Date().toISOString(),
    }, { onConflict: "championship_id,number" });
  }

  // Helper to upsert team stats
  async function updateTeam(teamName: string, goalsFor: number, goalsAgainst: number) {
    const won = goalsFor > goalsAgainst ? 1 : 0;
    const drawn = goalsFor === goalsAgainst ? 1 : 0;
    const lost = goalsFor < goalsAgainst ? 1 : 0;
    const points = won * 3 + drawn;

    const { data: existing } = await supabase
      .from("championship_teams")
      .select("*")
      .eq("championship_id", championship_id)
      .eq("team_name", teamName)
      .single();

    if (existing) {
      await supabase
        .from("championship_teams")
        .update({
          played: existing.played + 1,
          won: existing.won + won,
          drawn: existing.drawn + drawn,
          lost: existing.lost + lost,
          goals_for: existing.goals_for + goalsFor,
          goals_against: existing.goals_against + goalsAgainst,
          points: existing.points + points,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("championship_teams").insert({
        championship_id,
        team_name: teamName,
        played: 1,
        won,
        drawn,
        lost,
        goals_for: goalsFor,
        goals_against: goalsAgainst,
        points,
      });
    }
  }

  await updateTeam(home_team, home_score, away_score);
  await updateTeam(away_team, away_score, home_score);

  return NextResponse.json({ success: true });
}
