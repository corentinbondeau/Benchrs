import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUserDetailed, unauthorized, forbidden, isTeamCoach } from "@/lib/api-auth";
import { generateStorybook } from "@/lib/season/ai-generator";
import { buildSeasonStatsContext } from "@/lib/season/stats";
import { renderStorybookPdf } from "@/lib/season/storybook-pdf";

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
    const content = await generateStorybook(ctx);

    const season = ctx.season;
    let pdf: string | null = null;
    let insertedId: string | null = null;
    try {
      const { data } = await supabase
        .from("season_storybooks")
        .upsert(
          { team_id: teamId, season, content, created_by: user.id },
          { onConflict: "team_id,season" }
        )
        .select("id")
        .single();
      insertedId = data?.id ?? null;
    } catch (e) {
      console.error("[storybook] upsert error:", e);
    }

    try {
      pdf = `data:application/pdf;base64,${(await renderStorybookPdf(content, ctx)).toString("base64")}`;
    } catch {
      pdf = null;
    }

    return NextResponse.json({ ok: true, content, id: insertedId, pdf });
  } catch (e) {
    console.error("[season/storybook] échec:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur de génération" },
      { status: 500 }
    );
  }
}
