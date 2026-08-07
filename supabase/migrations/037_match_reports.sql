-- Compte-rendu de match généré par l'IA
-- Un seul rapport par match (event_id unique). Contenu structuré JSONB.
CREATE TABLE IF NOT EXISTS match_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE UNIQUE,
  team_id UUID NOT NULL,
  content JSONB NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE match_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view match_reports"
  ON public.match_reports FOR SELECT
  USING (
    team_id IN (SELECT public.user_team_ids())
  );

CREATE POLICY "Coaches can manage match_reports"
  ON public.match_reports FOR ALL
  USING (
    public.is_team_coach(team_id)
  )
  WITH CHECK (
    public.is_team_coach(team_id)
  );

CREATE INDEX IF NOT EXISTS idx_match_reports_event_id ON match_reports(event_id);
CREATE INDEX IF NOT EXISTS idx_match_reports_team_id ON match_reports(team_id);
