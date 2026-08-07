-- Historique des tests physiques (VMA / VMI) pour suivre l'évolution dans le temps
-- 1) table player_physical_tests
-- 2) RPC update_player_vma / update_player_vmi : enregistrent un test à chaque mise à jour
-- 3) backfill des valeurs déjà renseignées (vma / vmi) en test initial
-- Idempotent : peut être relancé sans risque.

-- ============================================================
-- 1) TABLE player_physical_tests
-- ============================================================
CREATE TABLE IF NOT EXISTS player_physical_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  test_type TEXT NOT NULL CHECK (test_type IN ('vma', 'vmi')),
  value NUMERIC(5,2) NOT NULL,
  tested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_physical_tests_player ON player_physical_tests(player_id, test_type, tested_at);
CREATE INDEX IF NOT EXISTS idx_player_physical_tests_team ON player_physical_tests(team_id);

ALTER TABLE player_physical_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view player_physical_tests"
  ON player_physical_tests FOR SELECT
  USING (team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Coaches can manage player_physical_tests"
  ON player_physical_tests FOR ALL
  USING (
    team_id IN (
      SELECT tm.team_id FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')
    )
  );

-- ============================================================
-- 2) RPC : enregistre un test à chaque mise à jour de la VMA
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_player_vma(player_id UUID, new_vma NUMERIC)
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

  INSERT INTO public.player_physical_tests (player_id, team_id, test_type, value, created_by)
  VALUES (player_id, v_team_id, 'vma', new_vma, auth.uid());
END;
$$;

-- ============================================================
-- 3) RPC : enregistre un test à chaque mise à jour de la VMI
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_player_vmi(player_id UUID, new_vmi NUMERIC)
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

  INSERT INTO public.player_physical_tests (player_id, team_id, test_type, value, created_by)
  VALUES (player_id, v_team_id, 'vmi', new_vmi, auth.uid());
END;
$$;

-- ============================================================
-- 4) BACKFILL : valeurs déjà présentes => test initial (si aucun historique)
-- ============================================================
INSERT INTO player_physical_tests (player_id, team_id, test_type, value, created_by)
SELECT DISTINCT ON (p.id) p.id, tm.team_id, 'vma', p.vma, NULL
FROM profiles p
JOIN team_members tm ON tm.user_id = p.id
WHERE p.vma IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM player_physical_tests t WHERE t.player_id = p.id AND t.test_type = 'vma')
ORDER BY p.id, tm.team_id;

INSERT INTO player_physical_tests (player_id, team_id, test_type, value, created_by)
SELECT DISTINCT ON (p.id) p.id, tm.team_id, 'vmi', p.vmi, NULL
FROM profiles p
JOIN team_members tm ON tm.user_id = p.id
WHERE p.vmi IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM player_physical_tests t WHERE t.player_id = p.id AND t.test_type = 'vmi')
ORDER BY p.id, tm.team_id;
