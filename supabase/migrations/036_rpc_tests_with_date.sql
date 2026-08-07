-- RPC update_player_vma / update_player_vmi : acceptent une date de test (tested_at)
-- pour la saisie de tests rétroactifs depuis la page Tests VMA/VMI.
-- Le test est enregistré dans player_physical_tests (voir migration 034) à chaque mise à jour.
CREATE OR REPLACE FUNCTION public.update_player_vma(player_id UUID, new_vma NUMERIC, tested_at TIMESTAMPTZ DEFAULT now())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  SELECT tm.team_id INTO v_team_id
  FROM public.team_members tm
  JOIN public.team_members tp ON tp.team_id = tm.team_id AND tp.user_id = player_id
  WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')
  LIMIT 1;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.profiles SET vma = new_vma WHERE id = player_id;

  INSERT INTO public.player_physical_tests (player_id, team_id, test_type, value, tested_at, created_by)
  VALUES (player_id, v_team_id, 'vma', new_vma, tested_at, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.update_player_vmi(player_id UUID, new_vmi NUMERIC, tested_at TIMESTAMPTZ DEFAULT now())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  SELECT tm.team_id INTO v_team_id
  FROM public.team_members tm
  JOIN public.team_members tp ON tp.team_id = tm.team_id AND tp.user_id = player_id
  WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')
  LIMIT 1;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.profiles SET vmi = new_vmi WHERE id = player_id;

  INSERT INTO public.player_physical_tests (player_id, team_id, test_type, value, tested_at, created_by)
  VALUES (player_id, v_team_id, 'vmi', new_vmi, tested_at, auth.uid());
END;
$$;
