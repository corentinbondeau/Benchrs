-- Fiches de séance sur les événements d'entraînement
-- "source" distingue les fiches générées par l'IA ('ai') des séances saisies à la main ('manual')
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai'));
