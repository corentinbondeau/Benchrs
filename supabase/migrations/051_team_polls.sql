-- 051_team_polls.sql
-- Sondages simples d'équipe (bus, couleur de maillot, repas d'après-match, ...).
-- Un sondage = titre + options (JSONB). Chaque membre vote pour UNE option.

CREATE TABLE IF NOT EXISTS public.team_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_polls_team ON public.team_polls(team_id);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.team_polls(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL CHECK (option_index >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON public.poll_votes(poll_id);

ALTER TABLE public.team_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- team_polls : lecture membres, gestion coach
DROP POLICY IF EXISTS "Members can view team_polls" ON public.team_polls;
CREATE POLICY "Members can view team_polls"
  ON public.team_polls FOR SELECT
  USING (team_id IN (SELECT public.user_visible_team_ids()));

DROP POLICY IF EXISTS "Coaches can manage team_polls" ON public.team_polls;
CREATE POLICY "Coaches can manage team_polls"
  ON public.team_polls FOR ALL
  USING (public.is_team_coach(team_id))
  WITH CHECK (public.is_team_coach(team_id));

-- poll_votes : lecture membres, chacun gère SON vote
DROP POLICY IF EXISTS "Members can view poll_votes" ON public.poll_votes;
CREATE POLICY "Members can view poll_votes"
  ON public.poll_votes FOR SELECT
  USING (team_id IN (SELECT public.user_visible_team_ids()));

DROP POLICY IF EXISTS "Members can vote poll_votes" ON public.poll_votes;
CREATE POLICY "Members can vote poll_votes"
  ON public.poll_votes FOR ALL
  USING (user_id = auth.uid() AND team_id IN (SELECT public.user_visible_team_ids()))
  WITH CHECK (user_id = auth.uid() AND team_id IN (SELECT public.user_visible_team_ids()));
