-- 053_match_availability.sql
-- Sondage de disponibilité avant match : dispo / pas dispo / incertain.
-- Une réponse par joueur et par match. Le coach voit le taux de dispo et les postes manquants.

CREATE TABLE IF NOT EXISTS public.match_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  availability TEXT NOT NULL CHECK (availability IN ('dispo', 'pas_dispo', 'incertain')),
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_match_availability_event ON public.match_availability(event_id);

ALTER TABLE public.match_availability ENABLE ROW LEVEL SECURITY;

-- Lecture : membres de l'équipe (le comité voit aussi via user_visible_team_ids)
DROP POLICY IF EXISTS "Members can view match_availability" ON public.match_availability;
CREATE POLICY "Members can view match_availability"
  ON public.match_availability FOR SELECT
  USING (team_id IN (SELECT public.user_visible_team_ids()));

-- Chaque joueur ne répond QUE pour lui-même ; un parent lié répond pour son enfant
DROP POLICY IF EXISTS "Players can manage own match_availability" ON public.match_availability;
CREATE POLICY "Players can manage own match_availability"
  ON public.match_availability FOR ALL
  USING (
    team_id IN (SELECT public.user_visible_team_ids())
    AND (
      player_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.parent_student ps
        WHERE ps.student_id = player_id
          AND ps.parent_id = auth.uid()
          AND ps.team_id = team_id
      )
    )
  )
  WITH CHECK (
    team_id IN (SELECT public.user_visible_team_ids())
    AND (
      player_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.parent_student ps
        WHERE ps.student_id = player_id
          AND ps.parent_id = auth.uid()
          AND ps.team_id = team_id
      )
    )
  );
