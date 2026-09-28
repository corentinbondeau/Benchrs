import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  replicateEnabled,
  startPrediction,
  getPrediction,
  createVideoSignedUrl,
} from "@/lib/replicate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/video-analysis/cron
// Filet de sécurité (Vercel Cron) pour les analyses via Replicate :
//   1. rattrapage : les jobs 'pending' non envoyés (création sans
//      auto-start, ou après un redéploiement) sont lancés sur Replicate ;
//   2. synchronisation : les jobs 'processing' avec external_id dont la
//      prédiction a terminé (webhook perdu) sont mis à jour.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!replicateEnabled()) {
    return NextResponse.json({ skipped: "replicate non configuré" });
  }

  const supabase = createAdminClient();
  const host = req.headers.get("x-forwarded-host") ?? "";
  const webhookUrl = `https://${host}/api/video-analysis/webhook`;

  let started = 0;
  let synced = 0;

  try {
    // 1) Rattrapage des jobs jamais envoyés (revenus en 'pending').
    const { data: pendings } = await supabase
      .from("video_analyses")
      .select("*")
      .eq("status", "pending")
      .is("external_id", null)
      .order("created_at")
      .limit(10);

    for (const job of pendings ?? []) {
      try {
        const videoUrl = await createVideoSignedUrl(job.storage_path);
        const prediction = await startPrediction(videoUrl, webhookUrl);
        await supabase
          .from("video_analyses")
          .update({
            status: "processing",
            provider: "replicate",
            external_id: prediction.id,
            progress: 5,
            started_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        started += 1;
      } catch {
        // un job qui échoue au lancement reste pending pour la prochaine passe
      }
    }

    // 2) Sync des 'processing' dont la prédiction a fini sans webhook.
    const { data: processing } = await supabase
      .from("video_analyses")
      .select("*")
      .eq("status", "processing")
      .eq("provider", "replicate")
      .not("external_id", "is", null)
      .limit(20);

    for (const job of processing ?? []) {
      try {
        const p = await getPrediction(job.external_id);
        if (p.status === "succeeded") {
          await supabase
            .from("video_analyses")
            .update({
              status: "completed",
              progress: 100,
              result: p.output ?? null,
              error: null,
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id);
          synced += 1;
        } else if (p.status === "failed" || p.status === "canceled") {
          await supabase
            .from("video_analyses")
            .update({
              status: p.status,
              error: String(p.error ?? "Échec de l'analyse distante").slice(0, 2000),
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id);
          synced += 1;
        }
      } catch {
        // prédiction introuvable → on laisse la prochaine passe décider
      }
    }

    return NextResponse.json({ started, synced });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message.slice(0, 300) : "Erreur" },
      { status: 500 }
    );
  }
}