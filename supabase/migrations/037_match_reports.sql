-- Compte-rendu de match
-- Un seul rapport par match (event_id unique). Contenu structuré JSONB.
-- source : 'ai' (généré par l'IA) ou 'manual' (saisi par un coach).
CREATE TABLE IF NOT EXISTS match_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE UNIQUE,
  team_id UUID NOT NULL,
  content JSONB NOT NULL,
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent : couvre le cas où le tableau a déjà été créé sans la colonne source
ALTER TABLE match_reports ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual'));

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
