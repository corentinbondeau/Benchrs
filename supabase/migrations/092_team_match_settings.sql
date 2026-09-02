-- Migration 092 : paramètres de match par équipe
ALTER TABLE public.team_settings
  ADD COLUMN IF NOT EXISTS half_duration INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS match_format INTEGER NOT NULL DEFAULT 11;

COMMENT ON COLUMN public.team_settings.half_duration IS
  'Durée d''une mi-temps en minutes (25, 30, 35, 45 selon la catégorie)';
COMMENT ON COLUMN public.team_settings.match_format IS
  'Nombre de joueurs par équipe (5, 7, 8 ou 11)';
