-- ============================================================
-- 126_remove_video_replicate.sql
-- Suppression complète du chemin d'analyse vidéo Replicate (API de
-- vision externe). L'analyse vidéo est désormais gérée UNIQUEMENT par
-- le worker auto-hébergé (ai-service/worker.py, YOLO + ByteTrack).
--
-- La route webhook, la route de lancement, le cron de filet, le module
-- src/lib/replicate.ts et cog.yaml sont retirés du code ; cette migration
-- nettoie les colonnes de liaison distante laissées par 108.
-- Idempotente : la base DROP IF EXISTS fonctionne que 108 ait été
-- appliquée ou non.
-- ============================================================

ALTER TABLE public.video_analyses
  DROP COLUMN IF EXISTS external_id,
  DROP COLUMN IF EXISTS provider;

DROP INDEX IF EXISTS public.video_analyses_external_id_idx;