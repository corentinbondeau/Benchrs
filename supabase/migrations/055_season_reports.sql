-- 055_season_reports.sql
-- Rapport de saison IA : bilan de fin de saison généré par Mistral
-- (stats, MVP, assiduité, progression des notes) + PDF partageable.
-- Un rapport par équipe et par saison.

CREATE TABLE IF NOT EXISTS public.season_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, season)
);

CREATE INDEX IF NOT EXISTS idx_season_reports_team ON public.season_reports(team_id);

ALTER TABLE public.season_reports ENABLE ROW LEVEL SECURITY;

-- Lecture : membres ; gestion : coach
DROP POLICY IF EXISTS "Members can view season_reports" ON public.season_reports;
CREATE POLICY "Members can view season_reports"
  ON public.season_reports FOR SELECT
  USING (team_id IN (SELECT public.user_visible_team_ids()));

DROP POLICY IF EXISTS "Coaches can manage season_reports" ON public.season_reports;
CREATE POLICY "Coaches can manage season_reports"
  ON public.season_reports FOR ALL
  USING (public.is_team_coach(team_id))
  WITH CHECK (public.is_team_coach(team_id));
