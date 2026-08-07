-- ============================================================
-- 041_training_sessions_visibility.sql
-- Visibilité des fiches de séance :
--   'coach' (défaut) = visible par les coachs uniquement
--   'team'           = visible par toute l'équipe
-- ============================================================

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'coach'
  CHECK (visibility IN ('coach', 'team'));
