-- Migration 104 : complète les colonnes de `team_settings`.
-- La migration 103 recréait `team_settings` avec uniquement `enable_rpe` ;
-- les colonnes ajoutées par 063/067/077/092 pouvaient être perdues si une
-- ancienne table clé/valeur a été droppée. On rétablit idempotemment l'ensemble.
ALTER TABLE public.team_settings
  ADD COLUMN IF NOT EXISTS enable_rpe BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_playing_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attendance_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recovery_protocol TEXT,
  ADD COLUMN IF NOT EXISTS rpe_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS half_duration INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS match_format INTEGER NOT NULL DEFAULT 11,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.team_settings.half_duration IS
  'Durée d''une mi-temps en minutes (25, 30, 35, 45 selon la catégorie)';
COMMENT ON COLUMN public.team_settings.match_format IS
  'Nombre de joueurs par équipe (5, 7, 8 ou 11)';