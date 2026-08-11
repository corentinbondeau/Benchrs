-- 066 : Matériel niveau club — le comité peut gérer l'inventaire de toutes les
--       équipes du club (en plus des coachs de chaque équipe).
--       L'ajout de matériel se fait en sélectionnant l'équipe de destination.

-- Helpers réutilisables
CREATE OR REPLACE FUNCTION public.user_is_club_member(p_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id AND user_id = auth.uid()
  );
$$;

-- club_id d'une équipe donnée (depuis teams.club_id)
CREATE OR REPLACE FUNCTION public.team_club_id(p_team_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT club_id FROM public.teams WHERE id = p_team_id;
$$;

-- Peut-on gérer l'inventaire d'une équipe ? (coach OU membre du comité du club)
CREATE OR REPLACE FUNCTION public.can_manage_team_inventory(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_team_coach(p_team_id)
    OR public.user_is_club_member(public.team_club_id(p_team_id));
$$;

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Coaches can manage inventory_items" ON public.inventory_items;
CREATE POLICY "Coaches can manage inventory_items" ON public.inventory_items
  FOR ALL USING (public.can_manage_team_inventory(team_id))
  WITH CHECK (public.can_manage_team_inventory(team_id));

ALTER TABLE public.item_loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Coaches can manage item_loans" ON public.item_loans;
CREATE POLICY "Coaches can manage item_loans" ON public.item_loans
  FOR ALL USING (public.can_manage_team_inventory(team_id))
  WITH CHECK (public.can_manage_team_inventory(team_id));
