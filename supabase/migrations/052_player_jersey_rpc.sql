-- 052_player_jersey_rpc.sql
-- Numéros de maillot : le coach fixe le numéro d'un joueur de SES équipes
-- (les joueurs peuvent déjà éditer leur propre numéro via les settings).

CREATE OR REPLACE FUNCTION public.update_player_jersey(player_id UUID, new_shirt_number INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new_shirt_number IS NULL OR new_shirt_number < 0 OR new_shirt_number > 99 THEN
    RAISE EXCEPTION 'Invalid jersey number';
  END IF;
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
    UPDATE public.profiles SET shirt_number = new_shirt_number WHERE id = player_id;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_player_jersey TO authenticated;
