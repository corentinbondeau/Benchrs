-- 046_personal_goals.sql
-- Objectifs personnels : le joueur se fixe des objectifs par saison (buts, assiduité, minutes...)
-- avec suivi automatique de la progression (stats de match + présence).
-- Visibles uniquement par le joueur, ses parents (parent_student) et les coachs de l'équipe.
-- Gérés uniquement par le joueur lui-même.

CREATE TABLE IF NOT EXISTS public.personal_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('goals', 'assists', 'matches', 'minutes', 'assiduite', 'other')),
  label TEXT NOT NULL,
  target NUMERIC NOT NULL DEFAULT 1 CHECK (target > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, team_id, season, label)
);

CREATE INDEX IF NOT EXISTS idx_personal_goals_player_season
  ON public.personal_goals(player_id, team_id, season);

ALTER TABLE public.personal_goals ENABLE ROW LEVEL SECURITY;

-- SELECT : le joueur lui-même, un coach/owner de l'équipe, ou un parent lié au joueur
DROP POLICY IF EXISTS "Goals visible by player, parents and coaches" ON public.personal_goals;
CREATE POLICY "Goals visible by player, parents and coaches"
  ON public.personal_goals FOR SELECT
  USING (
    auth.uid() = player_id
    OR public.is_team_coach(team_id)
    OR EXISTS (
      SELECT 1 FROM public.parent_student ps
      WHERE ps.parent_id = auth.uid()
        AND ps.student_id = player_id
        AND ps.team_id = team_id
    )
  );

-- INSERT/UPDATE/DELETE : seul le joueur gère ses propres objectifs
DROP POLICY IF EXISTS "Players manage own goals" ON public.personal_goals;
CREATE POLICY "Players manage own goals"
  ON public.personal_goals FOR ALL
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);
