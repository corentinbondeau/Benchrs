-- Fix team_members SELECT policy to allow viewing all members of a team
-- The previous policy (user_id = auth.uid()) only let users see their own row,
-- which broke the team settings page (member list + owner check for colors).

-- Helper function: returns all team_ids the current user belongs to
-- Uses SECURITY DEFINER to bypass RLS on team_members and avoid recursion
CREATE OR REPLACE FUNCTION public.user_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid();
$$;

-- Replace the SELECT policy
DROP POLICY IF EXISTS "Members can view their team membership" ON public.team_members;

CREATE POLICY "Members can view their team membership"
  ON public.team_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR team_id IN (SELECT public.user_team_ids())
  );
