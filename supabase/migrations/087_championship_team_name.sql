-- Migration 087 : ajouter team_name sur championships
-- Idempotente : utilise IF NOT EXISTS

ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS team_name TEXT;

COMMENT ON COLUMN public.championships.team_name IS
  'Nom de l''equipe du coach dans la competition DOFA (ex: CAMPHIN PEVELE ECF). Optionnel, renseigne lors du choix de l''equipe dans la poule.';

ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS official_standings JSONB;

COMMENT ON COLUMN public.championships.official_standings IS
  'Classement officiel FFF (endpoint classement_journees, enveloppe Hydra). Null tant que non publie.';
