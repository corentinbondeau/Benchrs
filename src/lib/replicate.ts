import { createAdminClient } from "@/lib/supabase/admin";

// ─── Intégration Replicate (API de vision ML externe, pay-per-run) ───
const TOKEN = process.env.REPLICATE_API_TOKEN ?? "";
const MODEL = process.env.REPLICATE_MODEL ?? "benchrs/video-analysis";

export interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: Record<string, unknown> | null;
  error: string | null;
}

export function replicateEnabled(): boolean {
  // Token absent/placeholder → on laisse le worker self-host (ou un
  // autre driver) consommer la file.
  return TOKEN.length > 20 && !TOKEN.startsWith("r8_CHANGEME");
}

async function replicateFetch(path: string, init: RequestInit = {}) {
  return fetch(`https://api.replicate.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    next: { revalidate: 0 },
  });
}

/** Lance une prédiction Replicate sur la vidéo (URL signée) et
 * expose le webhook de fin d'analyse (host courant = même déploiement
 * Vercel — préviews incluses). */
export async function startPrediction(
  videoUrl: string,
  webhookUrl: string
): Promise<ReplicatePrediction> {
  const res = await replicateFetch(`/models/${MODEL}/predictions`, {
    method: "POST",
    body: JSON.stringify({
      input: { video: videoUrl },
      webhook: webhookUrl,
      webhook_events_filter: ["completed"],
    }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`Replicate ${res.status} : ${detail}`);
  }
  return (await res.json()) as ReplicatePrediction;
}

export async function getPrediction(id: string): Promise<ReplicatePrediction> {
  const res = await replicateFetch(`/predictions/${id}`);
  if (!res.ok) throw new Error(`Replicate ${res.status}`);
  return (await res.json()) as ReplicatePrediction;
}

/** URL signée (1 h) du bucket privé que Replicate viendra chercher
 * côté serveur (il faut donc une URL publique le temps de la run). */
export async function createVideoSignedUrl(storagePath: string): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase.storage
    .from("match_videos")
    .createSignedUrl(storagePath, 3600);
  if (!data?.signedUrl) throw new Error("Impossible de signer la vidéo");
  return data.signedUrl;
}