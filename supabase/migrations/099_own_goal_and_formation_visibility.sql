-- 1. Ajoute les types "own_goal" (CSC par un joueur de l'équipe, compté pour l'adversaire)
--    et "opponent_own_goal" (CSC par un joueur adverse, compté pour nous) aux événements de match
ALTER TABLE match_events DROP CONSTRAINT IF EXISTS match_events_event_type_check;

ALTER TABLE match_events
  ADD CONSTRAINT match_events_event_type_check
  CHECK (event_type IN ('goal', 'opponent_goal', 'own_goal', 'opponent_own_goal', 'yellow_card', 'red_card', 'substitution', 'injury'));

-- 2. Visibilité de la composition d'équipe (coach-only vs toute l'équipe)
ALTER TABLE formations ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'team'
  CHECK (visibility IN ('coach', 'team'));
