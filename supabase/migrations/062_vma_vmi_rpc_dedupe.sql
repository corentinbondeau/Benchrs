-- Supprime les anciennes surcharges update_player_vma / update_player_vmi
-- (2 arguments : player_id, new_vma / new_vmi) qui coexistaient avec la version
-- 036 (3 arguments, tested_at DEFAULT now()).
-- Cause : la migration 036 a utilisé CREATE OR REPLACE avec une signature
-- différente, ce qui a CRÉÉ une seconde fonction au lieu de remplacer l'ancienne.
-- Résultat : PostgREST ne sait plus choisir ("Could not choose the best candidate
-- function") pour l'appel à 2 arguments de la fiche joueur, alors que la page
-- Tests (3 arguments) matche la nouvelle seule.
-- Idempotent : peut être relancé sans risque.

-- ============================================================
-- 1) DROP des anciennes surcharges (2 arguments)
-- ============================================================
DROP FUNCTION IF EXISTS public.update_player_vma(player_id UUID, new_vma NUMERIC);
DROP FUNCTION IF EXISTS public.update_player_vmi(player_id UUID, new_vmi NUMERIC);

-- ============================================================
-- 2) Version canonique (signature 036) : tested_at par défaut now()
-- ============================================================
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

GRANT EXECUTE ON FUNCTION public.update_player_vma(player_id UUID, new_vma NUMERIC, tested_at TIMESTAMPTZ) TO authenticated;

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

GRANT EXECUTE ON FUNCTION public.update_player_vmi(player_id UUID, new_vmi NUMERIC, tested_at TIMESTAMPTZ) TO authenticated;
