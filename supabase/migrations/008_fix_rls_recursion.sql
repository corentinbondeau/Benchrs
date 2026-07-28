-- Fix infinite recursion in RLS policies
-- The DELETE policy on team_members had a self-referencing subquery
-- that caused PostgreSQL error 42P17 (infinite recursion) on ALL queries
-- involving team_members, even simple SELECTs.

-- Create a SECURITY DEFINER helper to bypass RLS for the ownership check
CREATE OR REPLACE FUNCTION public.is_team_owner(team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = auth.uid()
      AND team_id = $1
      AND role = 'owner'
  );
$$;

-- Drop the old self-referencing DELETE policy
DROP POLICY IF EXISTS "Team owners can manage membership" ON public.team_members;

-- Recreate using the security definer function
CREATE POLICY "Team owners can manage membership"
  ON public.team_members FOR DELETE
  USING (public.is_team_owner(team_id));
