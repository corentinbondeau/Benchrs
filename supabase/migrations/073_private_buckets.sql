-- 073_private_buckets.sql
-- Passer les buckets contenant des données sensibles (photos/vidéos de mineurs,
-- PDF de préparation physique) en PRIVÉ : les URLs publiques (getPublicUrl) ne
-- sont plus world-readable. Les rendus passent par des URLs signées
-- (src/lib/storage.ts -> createSignedUrl, TTL 1h) générées avec le client anon
-- RLS-autorisé. Les buckets restent accessibles via createSignedUrl tant que le
-- user passe la policy SELECT correspondante.
--
-- team_branding (logo/bannière) RESTE PUBLIC : identité visuelle destinée à être
-- partagée, pas de PII.
-- Idempotent : peut être relancé sans risque.

-- ============================================================
-- 1) Buckets -> PRIVÉ
-- ============================================================
UPDATE storage.buckets
SET public = false
WHERE id IN ('gallery', 'physical_docs', 'challenge_media', 'club_feed');

-- ============================================================
-- 2) physical_prep_documents : conserver le chemin storage pour
--    pouvoir générer des URLs signées (l'ancienne donnée ne
--    stocke que l'URL publique complète ; le chemin se déduit
--    alors de l'URL, cf. storagePathFromPublicUrl).
-- ============================================================
ALTER TABLE public.physical_prep_documents ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Backfill du chemin depuis les URLs publiques déjà stockées
UPDATE public.physical_prep_documents
SET storage_path = substring(file_url from '/storage/v1/object/public/physical_docs/(.+)$')
WHERE storage_path IS NULL
  AND file_url LIKE '%/storage/v1/object/public/physical_docs/%';
