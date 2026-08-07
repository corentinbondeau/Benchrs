-- Add VMI (Vitesse Maximale Intermittente — 30-15 IFT) field to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vmi NUMERIC(5,2);

-- Secure function for coaches to update player VMI (bypasses RLS recursion),
-- coach limité aux joueurs de SES équipes
CREATE OR REPLACE FUNCTION public.update_player_vmi(player_id UUID, new_vmi NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'coach')
      AND EXISTS (
        SELECT 1 FROM public.team_members tp
        WHERE tp.team_id = tm.team_id
          AND tp.user_id = player_id
      )
  ) THEN
    UPDATE public.profiles SET vmi = new_vmi WHERE id = player_id;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_player_vmi TO authenticated;
