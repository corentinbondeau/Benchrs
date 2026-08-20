import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthUserDetailed,
  unauthorized,
  forbidden,
  isTeamMember,
  isTeamCoach,
} from "@/lib/api-auth";
import { generateSeasonPlan } from "@/lib/seasonPlan";
import { seasonDateRange, currentSeasonLabel, previousSeasonLabel } from "@/lib/goals";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await getAuthUserDetailed(req);
  const user = auth.user;
  if (!user) return unauthorized(auth.reason);

  let body: { teamId?: string; season?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }
  const { teamId } = body;
  const season = body.season || currentSeasonLabel();
  if (!teamId) {
    return NextResponse.json({ error: "teamId requis" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!(await isTeamMember(user.id, teamId))) return forbidden();
  if (!(await isTeamCoach(user.id, teamId))) {
    return NextResponse.json({ error: "Seuls les coachs peuvent générer un plan de saison" }, { status: 403 });
  }

  const range = seasonDateRange(season);
  if (!range) {
    return NextResponse.json({ error: "Saison invalide" }, { status: 400 });
  }

  const [{ data: team }, { data: prevPlan }, { data: prevReport }] = await Promise.all([
    supabase.from("teams").select("name").eq("id", teamId).maybeSingle(),
    supabase.from("season_plans").select("content").eq("team_id", teamId).eq("season", season).maybeSingle(),
    supabase.from("season_reports").select("content").eq("team_id", teamId).eq("season", previousSeasonLabel(season)).maybeSingle(),
  ]);

  if (prevPlan) {
    return NextResponse.json({ plan: prevPlan.content, cached: true });
  }

  const teamName = (team as { name?: string } | null)?.name || "mon équipe";
  const prevSummary =
    (prevReport?.content as { summary?: string } | undefined)?.summary?.slice(0, 400) ?? undefined;

  let plan;
  try {
    plan = await generateSeasonPlan({
      teamName,
      season,
      seasonStart: range.start.toISOString().slice(0, 10),
      seasonEnd: range.end.toISOString().slice(0, 10),
      prevSummary,
    });
  } catch (e) {
    console.error("[season/plan] AI generation error:", e);
    const message = e instanceof Error ? e.message : "Erreur lors de la génération du plan";
    return NextResponse.json({ error: `Échec de la génération IA : ${message}` }, { status: 502 });
  }

  const { error } = await supabase.from("season_plans").upsert(
    { team_id: teamId, season, content: plan, created_by: user.id },
    { onConflict: "team_id,season" }
  );
  if (error) {
    console.error("[season/plan] upsert error:", error);
    return NextResponse.json({ error: "Erreur lors de la sauvegarde" }, { status: 500 });
  }

  return NextResponse.json({ plan, cached: false });
}

export async function GET(req: Request) {
  const auth = await getAuthUserDetailed(req);
  const user = auth.user;
  if (!user) return unauthorized(auth.reason);

  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId");
  const season = url.searchParams.get("season") || currentSeasonLabel();
  if (!teamId) {
    return NextResponse.json({ error: "teamId requis" }, { status: 400 });
  }
  const supabase = createAdminClient();
  if (!(await isTeamMember(user.id, teamId))) return forbidden();

  const { data } = await supabase
    .from("season_plans")
    .select("content, created_at")
    .eq("team_id", teamId)
    .eq("season", season)
    .maybeSingle();

  return NextResponse.json({ plan: data?.content ?? null, created_at: data?.created_at ?? null });
}
