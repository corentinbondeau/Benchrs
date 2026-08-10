-- 057 : Rapports IA de saison (plan périodisé) et bilans trimestriels aux parents

CREATE TABLE IF NOT EXISTS season_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  content JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, season)
);
CREATE INDEX IF NOT EXISTS idx_season_plans_team ON season_plans(team_id);
ALTER TABLE season_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view season_plans" ON season_plans
  FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()));
CREATE POLICY "Coaches can manage season_plans" ON season_plans
  FOR ALL USING (public.is_team_coach(team_id)) WITH CHECK (public.is_team_coach(team_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON season_plans TO authenticated;

CREATE TABLE IF NOT EXISTS quarterly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quarter TEXT NOT NULL,
  content JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, player_id, quarter)
);
CREATE INDEX IF NOT EXISTS idx_quarterly_reports_team ON quarterly_reports(team_id);
ALTER TABLE quarterly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view quarterly_reports" ON quarterly_reports
  FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()));
CREATE POLICY "Coaches can manage quarterly_reports" ON quarterly_reports
  FOR ALL USING (public.is_team_coach(team_id)) WITH CHECK (public.is_team_coach(team_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON quarterly_reports TO authenticated;
