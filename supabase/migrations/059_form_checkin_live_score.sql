-- 059 : Score live public (token), check-in de forme avant séance, guide terrain (temps de trajet)

-- ==================== SCORE LIVE PUBLIC ====================
-- Token public par événement : sert à générer le lien de score live sans connexion
ALTER TABLE events ADD COLUMN IF NOT EXISTS live_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_live_token ON events(live_token) WHERE live_token IS NOT NULL;

-- ==================== CHECK-IN DE FORME (avant séance) ====================
-- Le joueur note sa forme 1-5 avant l'entraînement ; le coach complète le RPE (1-10) après.
ALTER TABLE session_rpe ADD COLUMN IF NOT EXISTS form_level INTEGER CHECK (form_level BETWEEN 1 AND 5);
ALTER TABLE session_rpe ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
-- Le RPE n'est plus obligatoire : une ligne peut exister avec uniquement le check-in de forme
ALTER TABLE session_rpe ALTER COLUMN rpe DROP NOT NULL;

-- ==================== GUIDE TERRAIN ====================
-- Temps de trajet estimé (min) saisi par le coach pour le déplacement
ALTER TABLE events ADD COLUMN IF NOT EXISTS travel_time_min INTEGER CHECK (travel_time_min BETWEEN 0 AND 600);
