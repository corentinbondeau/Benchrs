import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUserDetailed, unauthorized, forbidden, isTeamCoach } from "@/lib/api-auth";
import { generateNewsletter } from "@/lib/season/ai-generator";
import { buildSeasonStatsContext } from "@/lib/season/stats";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { user, reason } = await getAuthUserDetailed(req);
    if (!user) return unauthorized(reason);

    const body = await req.json().catch(() => null);
    const teamId = typeof body?.teamId === "string" ? body.teamId : "";
    const month = typeof body?.month === "string" && body.month ? body.month : null;
    if (!teamId) return NextResponse.json({ error: "teamId manquant" }, { status: 400 });
    if (!(await isTeamCoach(user.id, teamId))) return forbidden();

    const supabase = createAdminClient();
    const ctx = await buildSeasonStatsContext(supabase, teamId, month);
    const content = await generateNewsletter(ctx);

    const { data: inserted } = await (async () => {
      try {
        return await supabase
          .from("newsletters")
          .upsert(
            {
              team_id: teamId,
              month: month ?? "full",
              title: content.title,
              content,
              created_by: user.id,
            },
            { onConflict: "team_id,month" }
          )
          .select("id")
          .single();
      } catch {
        return { data: null, error: null };
      }
    })();

    return NextResponse.json({ ok: true, content, id: inserted?.id ?? null });
  } catch (e) {
    console.error("[newsletter] échec:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur de génération" },
      { status: 500 }
    );
  }
}
