-- Migration 006: Championship standings and matchdays

CREATE TABLE IF NOT EXISTS championships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  level TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS championship_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  played INTEGER NOT NULL DEFAULT 0,
  won INTEGER NOT NULL DEFAULT 0,
  drawn INTEGER NOT NULL DEFAULT 0,
  lost INTEGER NOT NULL DEFAULT 0,
  goals_for INTEGER NOT NULL DEFAULT 0,
  goals_against INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(championship_id, team_name)
);

CREATE TABLE IF NOT EXISTS matchdays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  label TEXT,
  played_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(championship_id, number)
);

ALTER TABLE championships ENABLE ROW LEVEL SECURITY;
ALTER TABLE championship_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchdays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read championships" ON championships FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can read championship_teams" ON championship_teams FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can read matchdays" ON matchdays FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Coachs can manage championships" ON championships FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);
CREATE POLICY "Coachs can manage championship_teams" ON championship_teams FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);
CREATE POLICY "Coachs can manage matchdays" ON matchdays FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);
