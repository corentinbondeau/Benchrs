-- ============================================================
-- 108_video_replicate.sql
-- Intégration API de vision ML externe (Replicate) pour l'analyse
-- vidéo : on mémorise l'identifiant de la prédiction distante pour
-- pouvoir relier le webhook de fin d'analyse au job.
--   provider    : 'replicate' (API externe) ou NULL (worker self-host)
--   external_id : id de la prédiction Replicate
-- ============================================================

ALTER TABLE public.video_analyses
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT;

CREATE INDEX IF NOT EXISTS video_analyses_external_id_idx
  ON public.video_analyses (external_id);