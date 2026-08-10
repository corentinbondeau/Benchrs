-- 064 : Lieux enregistrés + lieu d'attache de l'équipe
--        (réutilisation du lieu d'un événement + base pour le calcul auto du temps de trajet)

-- Lieux d'attache de l'équipe (origine du calcul de temps de trajet)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS home_location TEXT;

-- Lieux enregistrés par équipe (réutilisables sur les événements)
CREATE TABLE IF NOT EXISTS team_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, name)
);
CREATE INDEX IF NOT EXISTS idx_team_locations_team ON team_locations(team_id, created_at DESC);
ALTER TABLE team_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view team locations" ON team_locations
  FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()));
CREATE POLICY "Coaches manage team locations" ON team_locations
  FOR ALL USING (public.is_team_coach(team_id)) WITH CHECK (public.is_team_coach(team_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON team_locations TO authenticated;

-- Backfill : les lieux déjà utilisés sur les événements deviennent des lieux enregistrés
INSERT INTO team_locations (team_id, name, address)
SELECT DISTINCT team_id, location, location
FROM events
WHERE location IS NOT NULL AND btrim(location) <> '' AND team_id IS NOT NULL
ON CONFLICT (team_id, name) DO NOTHING;
