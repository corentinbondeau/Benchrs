-- Migration 096 : autoriser les coachs/owners à modifier les membres de leur équipe
-- (role, mute_status, etc.)
--
-- Aucune politique UPDATE n'existait sur team_members — les modifications
-- via le client Supabase étaient silencieusement ignorées par les RLS.

CREATE POLICY "Coaches can update team_members"
  ON public.team_members FOR UPDATE
  USING (public.is_team_coach(team_id))
  WITH CHECK (public.is_team_coach(team_id));
