import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden, isTeamMember } from "@/lib/api-auth";
import { normalizeVideoAnalysis } from "@/lib/videoAnalysis";
import { renderVideoAnalysisPdf } from "@/lib/export/videoAnalysisPdf";

export const dynamic = "force-dynamic";

// GET /api/video-analysis/export?id=<uuid>
// Génère et retourne le PDF d'une analyse vidéo côté serveur.
// L'utilisateur doit être membre de l'équipe propriétaire de l'analyse.
export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Paramètre 'id' manquant" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data: job, error } = await supabase
      .from("video_analyses")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!job) {
      return NextResponse.json(
        { error: "Analyse introuvable" },
        { status: 404 }
      );
    }

    if (!(await isTeamMember(user.id, job.team_id))) return forbidden();

    if (job.status !== "completed" || !job.result) {
      return NextResponse.json(
        { error: "L'analyse n'est pas encore terminée" },
        { status: 409 }
      );
    }

    const analysis = normalizeVideoAnalysis(job);
    const pdfBuffer = await renderVideoAnalysisPdf(analysis);

    const safeName = (analysis.title || "analyse-video")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[video-analysis/export] Erreur génération PDF:", err);
    return NextResponse.json(
      { error: "Erreur lors de la génération du PDF" },
      { status: 500 }
    );
  }
}
