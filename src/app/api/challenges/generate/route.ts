import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUserDetailed, unauthorized, forbidden, isTeamMember, isTeamCoach } from "@/lib/api-auth";
import { generateWeeklyChallenge, CHALLENGE_DIFFICULTIES } from "@/lib/challenges/ai-generator";

export const dynamic = "force-dynamic";

function parseWeekStart(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (isNaN(date.getTime())) return null;
  return value;
}

export async function POST(req: Request) {
  try {
    const { user, reason } = await getAuthUserDetailed(req);
    if (!user) return unauthorized(reason);

    const body = await req.json().catch(() => null);
    const teamId = typeof body?.teamId === "string" ? body.teamId : "";
    const weekStart = parseWeekStart(body?.weekStart);
    const difficulty =
      typeof body?.difficulty === "string" &&
      (CHALLENGE_DIFFICULTIES as readonly string[]).includes(body.difficulty)
        ? (body.difficulty as (typeof CHALLENGE_DIFFICULTIES)[number])
        : "moyen";

    if (!teamId) {
      return NextResponse.json({ error: "teamId manquant" }, { status: 400 });
    }
    if (!weekStart) {
      return NextResponse.json({ error: "weekStart invalide" }, { status: 400 });
    }
    if (!(await isTeamMember(user.id, teamId))) {
      return forbidden();
    }
    if (!(await isTeamCoach(user.id, teamId))) {
      return NextResponse.json(
        { error: "Seuls les coachs peuvent générer le défi de la semaine" },
        { status: 403 }
      );
    }

    const challenge = await generateWeeklyChallenge(difficulty);

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("weekly_challenges")
      .upsert(
        {
          team_id: teamId,
          week_start: weekStart,
          title: challenge.title,
          description: challenge.description,
          difficulty,
          created_by: user.id,
        },
        { onConflict: "team_id,week_start" }
      )
      .select()
      .single();

    if (error) {
      console.error("[challenges/generate] upsert échec:", error);
      return NextResponse.json({ error: "Erreur lors de la sauvegarde du défi" }, { status: 500 });
    }

    return NextResponse.json({ challenge: data });
  } catch (e) {
    console.error("[challenges/generate] échec IA:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur lors de la génération" },
      { status: 500 }
    );
  }
}
