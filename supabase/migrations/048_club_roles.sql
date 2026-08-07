-- 048_club_roles.sql
-- Rôle comité/président : visibilité (lecture) sur toutes les équipes d'un club.
-- Un membre du comité (role 'comite' ou 'president') voit l'ensemble des équipes de son club
-- en lecture seule via la fonction user_visible_team_ids(). Les coachs/owners gardent leurs droits.

-- Enum des rôles club
DO $$ BEGIN
  CREATE TYPE club_member_role AS ENUM ('president', 'comite');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Membres du club (niveau club, distinct de team_members)
CREATE TABLE IF NOT EXISTS public.club_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role club_member_role NOT NULL DEFAULT 'comite',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_club_members_club ON public.club_members(club_id);
CREATE INDEX IF NOT EXISTS idx_club_members_user ON public.club_members(user_id);

ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;

-- Helper : clubs visibles = clubs où l'on est membre du comité + clubs de ses équipes
CREATE OR REPLACE FUNCTION public.user_club_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT club_id FROM public.club_members WHERE user_id = auth.uid()
  UNION
  SELECT t.club_id FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  WHERE tm.user_id = auth.uid();
$$;

-- Helper : équipes visibles = membres d'équipe + équipes des clubs du comité
CREATE OR REPLACE FUNCTION public.user_visible_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
  UNION
  SELECT t.id FROM public.teams t
  JOIN public.club_members cm ON cm.club_id = t.club_id
  WHERE cm.user_id = auth.uid();
$$;

-- Helper : est-on président (ou créateur) du club ?
CREATE OR REPLACE FUNCTION public.is_club_president(p_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id AND user_id = auth.uid() AND role = 'president'
  ) OR EXISTS (
    SELECT 1 FROM public.clubs
    WHERE id = p_club_id AND created_by = auth.uid()
  );
$$;

-- RLS club_members
DROP POLICY IF EXISTS "Members can view club_members" ON public.club_members;
CREATE POLICY "Members can view club_members"
  ON public.club_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR club_id IN (SELECT public.user_club_ids())
  );

DROP POLICY IF EXISTS "Presidents can manage club_members" ON public.club_members;
CREATE POLICY "Presidents can manage club_members"
  ON public.club_members FOR ALL
  USING (public.is_club_president(club_id))
  WITH CHECK (public.is_club_president(club_id));

-- RLS clubs : le comité voit son club
DROP POLICY IF EXISTS "Members can view their club" ON public.clubs;
CREATE POLICY "Members can view their club"
  ON public.clubs FOR SELECT
  USING (id IN (SELECT public.user_club_ids()));

-- ============================================================
-- Extension des policies SELECT à user_visible_team_ids() (lecture club)
-- ============================================================

-- Cas particuliers (noms de policy différents du pattern générique)
DROP POLICY IF EXISTS "Members can view their teams" ON public.teams;
CREATE POLICY "Members can view their teams"
  ON public.teams FOR SELECT
  USING (id IN (SELECT public.user_visible_team_ids()));

DROP POLICY IF EXISTS "Members can view their team membership" ON public.team_members;
CREATE POLICY "Members can view their team membership"
  ON public.team_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR team_id IN (SELECT public.user_visible_team_ids())
  );

DROP POLICY IF EXISTS "Members can view team profiles" ON public.profiles;
CREATE POLICY "Members can view team profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR team_id IS NULL
    OR team_id IN (SELECT public.user_visible_team_ids())
  );

-- Pattern générique "Members can view <table>" sur team_id
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'events', 'attendances', 'training_sessions', 'match_stats', 'match_events',
    'match_ratings', 'match_player_ratings', 'motm_votes', 'formations', 'match_lineups',
    'match_reports', 'season_cycles', 'team_settings', 'session_rpe', 'player_physical_tests',
    'weekly_challenge_settings', 'weekly_challenges', 'challenge_submissions',
    'exercise_library', 'gallery_media', 'championships', 'tasks', 'trophies',
    'licences', 'cotisations', 'carpooling_trips', 'carpooling_bookings',
    'fitness_ratings', 'injuries', 'chat_channels', 'chat_members', 'chat_messages'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Members can view %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Members can view %s" ON public.%I FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()))',
      t, t
    );
  END LOOP;
END $$;
