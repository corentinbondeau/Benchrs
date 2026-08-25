import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUserDetailed, unauthorized, forbidden, isTeamCoach } from "@/lib/api-auth";
import { generateGreeting } from "@/lib/season/ai-generator";
import { buildSeasonStatsContext } from "@/lib/season/stats";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { user, reason } = await getAuthUserDetailed(req);
    if (!user) return unauthorized(reason);

    const body = await req.json().catch(() => null);
    const teamId = typeof body?.teamId === "string" ? body.teamId : "";
    if (!teamId) return NextResponse.json({ error: "teamId manquant" }, { status: 400 });
    if (!(await isTeamCoach(user.id, teamId))) return forbidden();

    const supabase = createAdminClient();
    const ctx = await buildSeasonStatsContext(supabase, teamId, null);

    const { data: members } = await supabase
      .from("team_members")
      .select("user_id, profile:profiles(id, first_name, last_name, is_active)")
      .eq("team_id", teamId)
      .eq("role", "player");
    const players = (members || [])
      .map((m) => ({
        userId: m.user_id as string,
        profile: (m as unknown as { profile?: { id: string; first_name?: string; last_name?: string; is_active?: boolean } | null })
          ?.profile,
      }))
      .filter((p) => p.profile && p.profile.is_active !== false);

    if (players.length === 0) {
      return NextResponse.json({ error: "Aucun joueur actif" }, { status: 400 });
    }

    const greetings: { player_id: string; team_id: string; season: string; content: string }[] = [];
    let failed = 0;
    for (const p of players) {
      const name = `${p.profile!.first_name || "Joueur"}${p.profile!.last_name ? " " + p.profile!.last_name : ""}`;
      try {
        const content = await generateGreeting(ctx, name);
        greetings.push({
          player_id: p.userId,
          team_id: teamId,
          season: ctx.season,
          content,
        });
      } catch (e) {
        failed++;
        console.error(`[greetings] échec pour ${name}:`, e);
      }
    }

    if (greetings.length > 0) {
      const { error } = await supabase
        .from("season_greetings")
        .upsert(greetings, { onConflict: "player_id,team_id,season" });
      if (error) console.error("[greetings] insert error:", error.message);
    }

    return NextResponse.json({
      ok: true,
      count: greetings.length,
      failed,
      season: ctx.season,
    });
  } catch (e) {
    console.error("[greetings] échec:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur de génération" },
      { status: 500 }
    );
  }
}
