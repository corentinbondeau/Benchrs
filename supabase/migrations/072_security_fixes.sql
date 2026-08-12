-- 072_security_fixes.sql
-- Correctifs issus de l'audit sécurité exhaustif (4 volets : API, RLS, storage+secrets, auth+RPC).
--   1) clubs.comite_invite_code : rejoindre un comité exige un code d'invitation (plus d'auto-comité)
--   2) profiles            : la policy "Coaches can update any profile" ne permet plus de changer
--                            le rôle d'autrui (WITH CHECK) + plus de lecture des profils sans équipe
--                            par des clients anonymes (team_id IS NULL)
--   3) parent_student      : un lien parent→enfant exige que l'enfant soit joueur de l'équipe
--   4) team_members        : suppression de l'INSERT RLS (toutes les adhésions passent par
--                            /api/auth/join-team au service role)
--   5) championships / championship_standings : écritures coach-only (SELECT reste membre)
--                            + team_id ajouté à championship_standings (backfill)
--   6) motm_votes          : le event_id doit appartenir à l'équipe du vote
--   7) storage challenge_media : indices foldername corrigés (team=[2], player=[3], le [1]
--                            est le littéral 'challenge') + upload/delete autorisé au parent lié
--   8) storage club_feed   : indices corrigés (club=[2], le [1] est le littéral 'club_feed')
--   9) chat_members        : SELECT limité aux canaux visibles (général/coachs/parents par
--                            rôle ; custom/player uniquement aux membres du canal + coachs)
-- Idempotent : peut être relancé sans risque.

-- ============================================================
-- 1) CLUBS : code d'invitation comité
-- ============================================================
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS comite_invite_code TEXT;

-- Backfill pour les clubs existants (les présidents peuvent le régénérer dans Réglages)
UPDATE public.clubs
SET comite_invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
WHERE comite_invite_code IS NULL OR comite_invite_code = '';

-- ============================================================
-- 2) PROFILES : + WITH CHECK (rôle préservé) sur la policy coach global
--    + garde auth.uid() IS NOT NULL sur la lecture des profils sans équipe
-- ============================================================
DROP POLICY IF EXISTS "Coaches can update any profile" ON public.profiles;
CREATE POLICY "Coaches can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.is_global_coach())
  WITH CHECK (
    public.is_global_coach()
    AND NEW.role IS NOT DISTINCT FROM OLD.role
  );

DROP POLICY IF EXISTS "Members can view team profiles" ON public.profiles;
CREATE POLICY "Members can view team profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR (auth.uid() IS NOT NULL AND team_id IS NULL)
    OR team_id IN (SELECT public.user_visible_team_ids())
  );

-- ============================================================
-- 3) PARENT_STUDENT : l'enfant doit être joueur de l'équipe
-- ============================================================
DROP POLICY IF EXISTS "Users can manage own parent links" ON public.parent_student;
CREATE POLICY "Users can manage own parent links"
  ON public.parent_student FOR ALL
  USING (
    auth.uid() = parent_id
    AND team_id IN (SELECT public.user_team_ids())
  )
  WITH CHECK (
    auth.uid() = parent_id
    AND team_id IN (SELECT public.user_team_ids())
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = parent_student.team_id
        AND tm.user_id = parent_student.student_id
        AND tm.role = 'player'
    )
  );

-- ============================================================
-- 4) TEAM_MEMBERS : plus d'INSERT direct en base (adhésions via API)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can join teams" ON public.team_members;

-- ============================================================
-- 5) CHAMPIONSHIPS / CHAMPIONSHIP_STANDINGS : coach-only en écriture
-- ============================================================
DROP POLICY IF EXISTS "Members can manage championships" ON public.championships;
CREATE POLICY "Coaches can manage championships"
  ON public.championships FOR ALL
  USING (public.is_team_coach(team_id))
  WITH CHECK (public.is_team_coach(team_id));

-- championship_standings n'avait aucune colonne team_id -> policies 000 permissives
ALTER TABLE public.championship_standings ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;

UPDATE public.championship_standings cs
SET team_id = c.team_id
FROM public.championships c
WHERE cs.championship_id = c.id AND cs.team_id IS NULL;

DROP POLICY IF EXISTS "Authenticated can view championship_standings" ON public.championship_standings;
DROP POLICY IF EXISTS "Authenticated can manage championship_standings" ON public.championship_standings;

CREATE POLICY "Members can view championship_standings"
  ON public.championship_standings FOR SELECT
  USING (team_id IN (SELECT public.user_visible_team_ids()));

CREATE POLICY "Coaches can manage championship_standings"
  ON public.championship_standings FOR ALL
  USING (public.is_team_coach(team_id))
  WITH CHECK (public.is_team_coach(team_id));

-- ============================================================
-- 6) MOTM_VOTES : event_id doit appartenir à l'équipe du vote
-- ============================================================
DROP POLICY IF EXISTS "Members can insert motm_votes" ON public.motm_votes;
CREATE POLICY "Members can insert motm_votes"
  ON public.motm_votes FOR INSERT
  WITH CHECK (
    voter_id = auth.uid()
    AND team_id IN (SELECT public.user_visible_team_ids())
    AND EXISTS (
      SELECT 1 FROM public.events ev
      WHERE ev.id = motm_votes.event_id AND ev.team_id = motm_votes.team_id
    )
  );

DROP POLICY IF EXISTS "Members can update own motm_votes" ON public.motm_votes;
CREATE POLICY "Members can update own motm_votes"
  ON public.motm_votes FOR UPDATE
  USING (
    voter_id = auth.uid()
    AND team_id IN (SELECT public.user_visible_team_ids())
  )
  WITH CHECK (
    voter_id = auth.uid()
    AND team_id IN (SELECT public.user_visible_team_ids())
    AND EXISTS (
      SELECT 1 FROM public.events ev
      WHERE ev.id = motm_votes.event_id AND ev.team_id = motm_votes.team_id
    )
  );

-- ============================================================
-- 7) STORAGE challenge_media : indices corrigés (team=[2], player=[3])
--    + parent lié autorisé (re-soumission pour son enfant)
-- ============================================================
DROP POLICY IF EXISTS "Members can view challenge_media" ON storage.objects;
DROP POLICY IF EXISTS "Members can upload challenge_media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own challenge_media" ON storage.objects;

CREATE POLICY "Members can view challenge_media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'challenge_media'
    AND (storage.foldername(name))[2]::uuid IN (SELECT public.user_visible_team_ids())
  );

CREATE POLICY "Members can upload challenge_media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'challenge_media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[2]::uuid IN (SELECT public.user_team_ids())
    AND (
      (storage.foldername(name))[3] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.parent_student ps
        WHERE ps.parent_id = auth.uid()
          AND ps.student_id = (storage.foldername(name))[3]::uuid
          AND ps.team_id = (storage.foldername(name))[2]::uuid
      )
    )
  );

CREATE POLICY "Users can delete own challenge_media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'challenge_media'
    AND (storage.foldername(name))[2]::uuid IN (SELECT public.user_visible_team_ids())
    AND (
      (storage.foldername(name))[3] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.parent_student ps
        WHERE ps.parent_id = auth.uid()
          AND ps.student_id = (storage.foldername(name))[3]::uuid
          AND ps.team_id = (storage.foldername(name))[2]::uuid
      )
      OR public.is_team_coach((storage.foldername(name))[2]::uuid)
    )
  );

-- ============================================================
-- 8) STORAGE club_feed : indices corrigés (club=[2], le [1] est 'club_feed')
-- ============================================================
DROP POLICY IF EXISTS "Public read club_feed" ON storage.objects;
DROP POLICY IF EXISTS "Members upload club_feed" ON storage.objects;
DROP POLICY IF EXISTS "Members update club_feed" ON storage.objects;
DROP POLICY IF EXISTS "Coaches delete club_feed" ON storage.objects;
DROP POLICY IF EXISTS "Club members can view club_feed" ON storage.objects;
DROP POLICY IF EXISTS "Club members can update club_feed" ON storage.objects;
DROP POLICY IF EXISTS "Club members can delete club_feed" ON storage.objects;

CREATE POLICY "Club members can view club_feed"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'club_feed'
    AND (storage.foldername(name))[2]::uuid IN (SELECT public.user_club_ids())
  );

CREATE POLICY "Club members can upload club_feed"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'club_feed'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[2]::uuid IN (SELECT public.user_club_ids())
  );

CREATE POLICY "Club members can update club_feed"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'club_feed'
    AND (storage.foldername(name))[2]::uuid IN (SELECT public.user_club_ids())
  );

CREATE POLICY "Club members can delete club_feed"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'club_feed'
    AND (storage.foldername(name))[2]::uuid IN (SELECT public.user_club_ids())
  );

-- ============================================================
-- 9) CHAT_MEMBERS : la SELECT ne doit pas exposer les membres de
--    TOUS les canaux de l'équipe (un joueur ne voit pas qui est
--    inscrit sur le canal privé d'un autre joueur).
--    Canaux implicites (general/parents/coaches) = visibles à
--    l'équipe ; custom/player = membres du canal + coachs/owners.
--    (sous-requête sur chat_members impossible ici -> helper
--     SECURITY DEFINER, cf. règle "jamais de sous-query sur la
--     table protégée dans une policy RLS")
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_chat_member(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_members cm
    WHERE cm.channel_id = p_channel_id
      AND cm.user_id = auth.uid()
      AND cm.left_at IS NULL
  );
$$;

DROP POLICY IF EXISTS "Members can view chat_members" ON public.chat_members;

CREATE POLICY "Members can view chat_members"
  ON public.chat_members FOR SELECT
  USING (
    team_id IN (SELECT public.user_visible_team_ids())
    AND (
      EXISTS (
        SELECT 1 FROM public.chat_channels cc
        WHERE cc.id = chat_members.channel_id
          AND cc.player_id IS NULL
          AND cc.channel_type IN ('general','parents','coaches')
      )
      OR public.is_chat_member(chat_members.channel_id)
      OR EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = chat_members.team_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('coach','owner')
      )
    )
  );
