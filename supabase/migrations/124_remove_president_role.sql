-- 124_remove_president_role.sql
-- Supprime le rôle 'president' de club_members : tous les membres du club sont désormais
-- de simples 'comite' (égalité, pas de couronne). Idempotent : ne fait rien si la migrations
-- 048 (et suivantes) n'a pas encore été appliquée EN L'ÉTAT (enum sans 'president').

-- 1. Rebasculer les éventuelles lignes 'president' vers 'comite'.
--
-- NOTE : on GARDE le label 'president' dans l'enum. Deux raisons :
--   - ALTER TYPE ... DROP VALUE n'existe qu'en PostgreSQL 17 (et l'enum
--     secondaire club_member_role_new recréerait « 0A000 cannot alter type of
--     a column used in a policy definition » : des centaines de policies club
--     font `cm.role = 'comite'` sur club_members) ;
--   - le rôle est néanmoins RÉELLEMENT supprimé : plus aucune ligne, aucun
--     code, aucune policy ne référence 'president'. Le label est dormant.
DO $$
BEGIN
  UPDATE public.club_members SET role = 'comite' WHERE role = 'president';
END $$;

-- 2. Helper unifié : membre du comité (ou créateur) du club.
CREATE OR REPLACE FUNCTION public.is_club_committee(p_club_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id AND user_id = p_user_id AND role = 'comite'
  ) OR EXISTS (
    SELECT 1 FROM public.clubs
    WHERE id = p_club_id AND created_by = p_user_id
  );
$$;

-- 3. Re-recree les policies « President » rencontrées dans 048/049/063 (si présentes
-- sur une base où ces migrations ont déjà été appliquées), puis depose l'ancien helper.
DO $$
BEGIN
  IF to_regclass('public.club_members') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Presidents can manage club_members" ON public.club_members;
    DROP POLICY IF EXISTS "Committee can manage club_members" ON public.club_members;
    CREATE POLICY "Committee can manage club_members"
      ON public.club_members FOR ALL
      USING (public.is_club_committee(club_id))
      WITH CHECK (public.is_club_committee(club_id));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.club_aliases') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Presidents can manage club_aliases" ON public.club_aliases;
    DROP POLICY IF EXISTS "Committee can manage club_aliases" ON public.club_aliases;
    CREATE POLICY "Committee can manage club_aliases"
      ON public.club_aliases FOR ALL
      USING (public.is_club_committee(club_id))
      WITH CHECK (public.is_club_committee(club_id));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.activity_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Coaches delete activity logs" ON public.activity_logs;
    CREATE POLICY "Coaches delete activity logs" ON public.activity_logs
      FOR DELETE USING (
        public.is_team_coach(team_id)
        OR (club_id IS NOT NULL AND public.is_club_committee(club_id))
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.club_posts') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Coaches delete posts" ON public.club_posts;
    CREATE POLICY "Coaches delete posts" ON public.club_posts
      FOR DELETE USING (
        public.is_team_coach(team_id)
        OR public.is_club_committee(club_id)
      );
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.is_club_president(uuid);