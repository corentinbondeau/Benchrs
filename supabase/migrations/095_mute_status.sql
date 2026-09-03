-- Migration 095 : statut de mutation sur les membres d'équipe
-- null = non muté (joueur de l'effectif principal)
-- 'mute' = muté (emprunté d'une autre équipe du club, en période officielle)
-- 'mute_hors_periode' = muté hors période

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS mute_status TEXT
  CHECK (mute_status IS NULL OR mute_status IN ('mute', 'mute_hors_periode'));

COMMENT ON COLUMN public.team_members.mute_status IS
  'Statut de mutation : null = non muté, mute = muté en période, mute_hors_periode = muté hors période';
