-- Autorise le type « but de l'adversaire » dans les événements de match en direct
ALTER TABLE match_events DROP CONSTRAINT IF EXISTS match_events_event_type_check;

ALTER TABLE match_events
  ADD CONSTRAINT match_events_event_type_check
  CHECK (event_type IN ('goal', 'opponent_goal', 'yellow_card', 'red_card', 'substitution', 'injury'));
