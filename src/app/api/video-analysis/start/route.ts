import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden, isTeamCoach } from "@/lib/api-auth";
import {
  replicateEnabled,
  startPrediction,
  createVideoSignedUrl,
} from "@/lib/replicate";

export const dynamic = "force-dynamic";

// POST /api/video-analysis/start
// Déclenche l'analyse du job via l'API de vision externe (Replicate) :
// une prédiction démarre, on mémorise external_id/provider et le statut
// bascule en 'processing' ; le résultat arrive par webhook. Idempotent
// (si la prédiction est déjà lancée, on renvoie l'état courant).
export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    if (!replicateEnabled()) {
      return NextResponse.json(
        { error: "API d'analyse non configurée (REPLICATE_API_TOKEN manquant)" },
        { status: 503 }
      );
    }

    const { jobId } = await req.json().catch(() => ({}));
    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId requis" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: job, error: fetchError } = await supabase
      .from("video_analyses")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!job) {
      return NextResponse.json({ error: "Analyse introuvable" }, { status: 404 });
    }
    if (!(await isTeamCoach(user.id, job.team_id))) return forbidden();

    // Déjà envoyé ? Si la prédiction tourne encore, rien à faire.
    if (job.external_id) return NextResponse.json({ job, alreadyStarted: true });
    if (job.status !== "pending") {
      return NextResponse.json({ error: "Analyse déjà traitée" }, { status: 409 });
    }

    const videoUrl = await createVideoSignedUrl(job.storage_path);
    const host = req.headers.get("host") ?? "";
    if (!host) {
      return NextResponse.json({ error: "Hôte non résolu" }, { status: 500 });
    }
    const webhookUrl = `https://${host}/api/video-analysis/webhook`;

    const prediction = await startPrediction(videoUrl, webhookUrl);

    const { data: updated, error: updateError } = await supabase
      .from("video_analyses")
      .update({
        status: "processing",
        provider: "replicate",
        external_id: prediction.id,
        progress: 5,
        started_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", job.id)
      .select()
      .single();
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ job: updated, predictionId: prediction.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message.slice(0, 300) : "Erreur interne" },
      { status: 500 }
    );
  }
}