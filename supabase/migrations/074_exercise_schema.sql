-- Schéma TacticalPad sur les exercices (bibliothèque + fiches de séance)
-- La colonne `exercises` de `training_sessions` étant JSONB, aucun changement n'est nécessaire côté séances.

ALTER TABLE exercise_library
  ADD COLUMN IF NOT EXISTS schema JSONB;
