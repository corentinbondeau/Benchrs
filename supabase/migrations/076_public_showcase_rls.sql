-- Allow anyone (including anonymous) to view public clubs
CREATE POLICY "Anyone can view public clubs"
  ON public.clubs FOR SELECT
  USING (is_public = true AND public_slug IS NOT NULL);

-- Allow anyone to view teams of public clubs
CREATE POLICY "Anyone can view teams of public clubs"
  ON public.teams FOR SELECT
  USING (
    club_id IN (
      SELECT id FROM public.clubs WHERE is_public = true
    )
  );

-- Allow committee members (not just creator) to update their club
DROP POLICY IF EXISTS "Club owners can update their club" ON public.clubs;
CREATE POLICY "Club owners and committee can update their club"
  ON public.clubs FOR UPDATE
  USING (
    created_by = auth.uid()
    OR id IN (SELECT public.user_club_ids())
  );
