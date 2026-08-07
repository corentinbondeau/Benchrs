-- 043_exercise_library.sql
-- Bibliothèque d'exercices (coachs) : sauvegarder un exercice (name/duration/description/drill_type)
-- pour le réutiliser dans les fiches de séance et les séances Tactiques.
-- RLS : membres SELECT, coachs ALL (via public.is_team_coach).

CREATE TABLE IF NOT EXISTS public.exercise_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id),
  name TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 15 CHECK (duration > 0),
  description TEXT,
  drill_type TEXT NOT NULL DEFAULT 'technique' CHECK (drill_type IN ('échauffement', 'technique', 'tactique', 'physique', 'jeu')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exercise_library_team ON public.exercise_library(team_id);

ALTER TABLE public.exercise_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view exercise_library" ON public.exercise_library;
CREATE POLICY "Members can view exercise_library"
  ON public.exercise_library FOR SELECT
  USING (team_id IN (SELECT public.user_team_ids()));

DROP POLICY IF EXISTS "Coaches can manage exercise_library" ON public.exercise_library;
CREATE POLICY "Coaches can manage exercise_library"
  ON public.exercise_library FOR ALL
  USING (public.is_team_coach(team_id))
  WITH CHECK (public.is_team_coach(team_id));
