-- Migration 093 : corriger les RLS de carpooling_trips et carpooling_bookings
--
-- Bug : la politique "Members can manage carpooling_trips" utilisait
-- une sous-requête sur team_members qui est elle-même protégée par RLS.
-- Lors d'un INSERT, la sous-requête retournait un ensemble vide et
-- l'INSERT était refusé silencieusement.
--
-- Fix : utiliser user_visible_team_ids() (SECURITY DEFINER) qui contourne
-- les RLS de team_members.

-- carpooling_trips : INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Members can manage carpooling_trips" ON public.carpooling_trips;
CREATE POLICY "Members can manage carpooling_trips"
  ON public.carpooling_trips FOR ALL
  USING (team_id IN (SELECT public.user_visible_team_ids()))
  WITH CHECK (team_id IN (SELECT public.user_visible_team_ids()));

-- carpooling_bookings : INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Members can manage carpooling_bookings" ON public.carpooling_bookings;
CREATE POLICY "Members can manage carpooling_bookings"
  ON public.carpooling_bookings FOR ALL
  USING (team_id IN (SELECT public.user_visible_team_ids()))
  WITH CHECK (team_id IN (SELECT public.user_visible_team_ids()));
