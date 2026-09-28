import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReplicatePrediction } from "@/lib/replicate";

export const dynamic = "force-dynamic";

// POST /api/video-analysis/webhook
// Webhook Replicate (fin d'analyse). PUBLIC (appelé par l'API externe,
// whitelisté dans proxy.ts). La liaison se fait par external_id : on
// ne peut écrire que sur une ligne que NOUS avons créée et envoyée.
//   succeeded → result = output, status completed
//   failed/canceled → status correspondant + erreur
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<ReplicatePrediction>;
    const id = body.id;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: job } = await supabase
      .from("video_analyses")
      .select("*")
      .eq("external_id", id)
      .maybeSingle();
    if (!job) {
      // Prédiction qui ne nous appartient pas → on l'ignore poliment.
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    if (body.status === "succeeded") {
      await supabase
        .from("video_analyses")
        .update({
          status: "completed",
          progress: 100,
          result: body.output ?? null,
          error: null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    } else if (body.status === "failed" || body.status === "canceled") {
      await supabase
        .from("video_analyses")
        .update({
          status: body.status,
          error: String(body.error ?? "Échec de l'analyse distante").slice(0, 2000),
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}