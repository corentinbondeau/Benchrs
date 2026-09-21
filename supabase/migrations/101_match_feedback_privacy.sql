-- ============================================================
-- 101 : match_ratings (retour du coach) — confiance à grain
-- joueur au lieu de team-wide.
--
-- Problème : la policy 005 "Members can view match_ratings"
-- (SELECT team-scoped) n'a jamais été dropée → TOUT membre lit
-- les retours de TOUS les joueurs. L'utilisateur veut que le
-- retour du coach soit PRIVÉ : uniquement visible par (a) le
-- joueur concerné, (b) SES parents, (c) les coachs de l'équipe.
--
-- Pattern RLS maison (voir mémoire) : jamais de sous-query sur
-- une table protégée DANS une policy → helper SECURITY DEFINER
-- (le SELECT sur parent_student s'y fait du point de vue du
-- definer, en contournant la récursion de RLS).
-- ============================================================

-- Helper parent (SECURITY DEFINER, réutilisable) : ce parent est-il
-- lié à CE joueur (via parent_student, même équipe) ? 
CREATE OR REPLACE FUNCTION public.is_parent_of_player(
  parent_id uuid,
  player_id uuid,
  team_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_student ps
    WHERE ps.parent_id = is_parent_of_player.parent_id
      AND ps.student_id = is_parent_of_player.player_id
      AND ps.team_id = is_parent_of_player.team_id
  );
$$;

-- ============================================================
-- 1) Écriture : le coach (071 "Coaches can manage match_ratings"
--    FOR ALL via is_team_coach) gère tout. Invariant conservé.
-- ============================================================

-- 2) SELECT — on droppe la brèche team-wide (005) et on pose des
-- policies à grain joueur/parent/coach.
DROP POLICY IF EXISTS "Members can view match_ratings" ON match_ratings;
DROP POLICY IF EXISTS "Members can manage match_ratings" ON match_ratings;
DROP POLICY IF EXISTS "Authenticated can view match_ratings" ON match_ratings;
DROP POLICY IF EXISTS "Authenticated can manage match_ratings" ON match_ratings;

CREATE POLICY "Coaches can view match_ratings"
  ON match_ratings FOR SELECT
  USING (public.is_team_coach(team_id));

CREATE POLICY "Player can view own match_ratings"
  ON match_ratings FOR SELECT
  USING (player_id = auth.uid());

CREATE POLICY "Parents can view child match_ratings"
  ON match_ratings FOR SELECT
  USING (public.is_parent_of_player(auth.uid(), player_id, team_id));
