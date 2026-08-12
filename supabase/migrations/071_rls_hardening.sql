-- 071_rls_hardening.sql
-- Durcissement sécurité RLS (audit) :
--   1) team_members : plus d'auto-inscription en owner/coach (rôle limité à player/parent)
--   2) profiles     : INSERT limité à soi-même + UPDATE self-only WITH CHECK
--                      + trigger bloquant tout changement de rôle (escalade vers
--                      "Coaches can update any profile")
--   3) parent_student : gestion réservée au parent concerné (même fix que 030,
--                      repris ici car 030 peut ne pas être appliquée)
--   4) chat         : vraie confidentialité des canaux (coachs/parents/custom/player),
--                      suppression de la policy FOR ALL survivante sur chat_messages,
--                      messages immuables (INSERT + SELECT uniquement)
--   5) Écritures coach-only : events, match_stats, match_events, match_ratings,
--                      injuries, trophies, formations, match_lineups,
--                      cotisations, payment_history (SELECT reste membre)
--   6) motm_votes : chacun ne gère QUE son vote
--   7) Storage     : SELECT scopé à l'équipe (gallery, physical_docs, challenge_media,
--                      club_feed) + dossier joueur vérifié à l'upload challenge
-- Idempotent : peut être relancé sans risque.

-- ============================================================
-- 1) TEAM_MEMBERS : pas d'auto-inscription en owner/coach
--    (les inscriptions passent par /api/auth/* avec le service role)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can join teams" ON public.team_members;
CREATE POLICY "Authenticated can join teams"
  ON public.team_members FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND role IN ('player', 'parent')
  );

-- ============================================================
-- 2) PROFILES : INSERT self-only + UPDATE self-only WITH CHECK
--    + pas de changement de rôle sur soi-même
-- ============================================================
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = NEW.id AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Impossible de modifier son propre rôle';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_no_self_role_change ON public.profiles;
CREATE TRIGGER trg_profiles_no_self_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_change();

-- ============================================================
-- 3) PARENT_STUDENT : seul le parent concerné gère ses liens
-- ============================================================
DROP POLICY IF EXISTS "Members can manage parent_student" ON public.parent_student;
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
  );

-- ============================================================
-- 4) CHAT : confidentialité réelle des canaux
-- ============================================================

-- --- 4a) CHAT_CHANNELS : visibilité par rôle ou par adhésion
DROP POLICY IF EXISTS "Members can view chat_channels" ON public.chat_channels;
CREATE POLICY "Members can view chat_channels"
  ON public.chat_channels FOR SELECT
  USING (
    team_id IN (SELECT public.user_visible_team_ids())
    AND (
      channel_type = 'general'
      OR (
        channel_type = 'parents'
        AND (
          EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = chat_channels.team_id AND tm.user_id = auth.uid()
              AND tm.role IN ('parent','coach','owner')
          )
          OR EXISTS (
            SELECT 1 FROM public.chat_members cm
            WHERE cm.channel_id = chat_channels.id AND cm.user_id = auth.uid() AND cm.left_at IS NULL
          )
        )
      )
      OR (
        channel_type = 'coaches'
        AND (
          EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = chat_channels.team_id AND tm.user_id = auth.uid()
              AND tm.role IN ('coach','owner')
          )
          OR EXISTS (
            SELECT 1 FROM public.chat_members cm
            WHERE cm.channel_id = chat_channels.id AND cm.user_id = auth.uid() AND cm.left_at IS NULL
          )
        )
      )
      OR (
        channel_type IN ('custom','player')
        AND (
          EXISTS (
            SELECT 1 FROM public.chat_members cm
            WHERE cm.channel_id = chat_channels.id AND cm.user_id = auth.uid() AND cm.left_at IS NULL
          )
          OR EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = chat_channels.team_id AND tm.user_id = auth.uid()
              AND tm.role IN ('coach','owner')
          )
        )
      )
    )
  );

-- Gestion des canaux : coach/owner pour tout, créateur pour ses canaux custom
DROP POLICY IF EXISTS "Members can manage chat_channels" ON public.chat_channels;
CREATE POLICY "Members can manage chat_channels"
  ON public.chat_channels FOR ALL
  USING (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = chat_channels.team_id AND tm.user_id = auth.uid()
          AND tm.role IN ('coach','owner')
      )
      OR (
        channel_type = 'custom'
        AND created_by = auth.uid()
      )
    )
  )
  WITH CHECK (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = chat_channels.team_id AND tm.user_id = auth.uid()
          AND tm.role IN ('coach','owner')
      )
      OR (
        channel_type = 'custom'
        AND created_by = auth.uid()
      )
    )
  );

-- --- 4b) CHAT_MESSAGES : lecture par adhésion ou rôle coach ; insertion
--        limitée aux membres du canal ; suppression de la policy FOR ALL
DROP POLICY IF EXISTS "Members can manage chat_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Members can view chat_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Members can send chat_messages" ON public.chat_messages;

CREATE POLICY "Members can view chat_messages"
  ON public.chat_messages FOR SELECT
  USING (
    team_id IN (SELECT public.user_visible_team_ids())
    AND (
      EXISTS (
        SELECT 1 FROM public.chat_members cm
        WHERE cm.channel_id = chat_messages.channel_id
          AND cm.user_id = auth.uid()
          AND cm.left_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.chat_channels cc
        JOIN public.team_members tm ON tm.team_id = cc.team_id
        WHERE cc.id = chat_messages.channel_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('coach','owner')
      )
    )
  );

CREATE POLICY "Members can send chat_messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND sender_id = auth.uid()
    AND team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
    AND team_id = (SELECT cc.team_id FROM public.chat_channels cc WHERE cc.id = chat_messages.channel_id)
    AND EXISTS (
      SELECT 1 FROM public.chat_members cm
      WHERE cm.channel_id = chat_messages.channel_id
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
    )
  );

-- --- 4c) CHAT_MEMBERS : INSERT durci (coach, créateur de canal custom,
--        ou auto-inscription SA ligne sur un canal autorisé par rôle)
DROP POLICY IF EXISTS "Members can insert chat_members" ON public.chat_members;

CREATE POLICY "Members can insert chat_members"
  ON public.chat_members FOR INSERT
  WITH CHECK (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
    AND team_id = (SELECT cc.team_id FROM public.chat_channels cc WHERE cc.id = chat_members.channel_id)
    AND (
      EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = chat_members.team_id AND tm.user_id = auth.uid()
          AND tm.role IN ('coach','owner')
      )
      OR EXISTS (
        SELECT 1 FROM public.chat_channels cc
        WHERE cc.id = chat_members.channel_id AND cc.channel_type = 'custom'
          AND cc.created_by = auth.uid()
      )
      OR (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.chat_channels cc
          WHERE cc.id = chat_members.channel_id
            AND (
              cc.channel_type = 'general'
              OR (
                cc.channel_type = 'parents'
                AND EXISTS (
                  SELECT 1 FROM public.team_members tm
                  WHERE tm.team_id = chat_members.team_id AND tm.user_id = auth.uid()
                    AND tm.role IN ('parent','coach','owner')
                )
              )
              OR (
                cc.channel_type = 'coaches'
                AND EXISTS (
                  SELECT 1 FROM public.team_members tm
                  WHERE tm.team_id = chat_members.team_id AND tm.user_id = auth.uid()
                    AND tm.role IN ('coach','owner')
                )
              )
            )
        )
      )
    )
  );

-- ============================================================
-- 5) ÉCRITURES COACH-ONLY (SELECT reste ouvert aux membres)
-- ============================================================
-- Helper (déjà défini en 030 ; redéfinition idempotente pour être autonome)
CREATE OR REPLACE FUNCTION public.is_team_coach(team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = auth.uid()
      AND team_id = $1
      AND role IN ('owner', 'coach')
  );
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'events', 'match_stats', 'match_events', 'match_ratings',
    'injuries', 'trophies', 'formations', 'match_lineups',
    'cotisations', 'payment_history'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Members can manage %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Coaches can manage %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Coaches can manage %s" ON public.%I FOR ALL USING (public.is_team_coach(team_id)) WITH CHECK (public.is_team_coach(team_id))',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================
-- 6) MOTM_VOTES : chacun ne gère que son vote
-- ============================================================
DROP POLICY IF EXISTS "Members can manage motm_votes" ON public.motm_votes;
DROP POLICY IF EXISTS "Members can insert motm_votes" ON public.motm_votes;
DROP POLICY IF EXISTS "Members can update own motm_votes" ON public.motm_votes;
DROP POLICY IF EXISTS "Members can delete own motm_votes" ON public.motm_votes;

CREATE POLICY "Members can insert motm_votes"
  ON public.motm_votes FOR INSERT
  WITH CHECK (
    voter_id = auth.uid()
    AND team_id IN (SELECT public.user_visible_team_ids())
  );

CREATE POLICY "Members can update own motm_votes"
  ON public.motm_votes FOR UPDATE
  USING (
    voter_id = auth.uid()
    AND team_id IN (SELECT public.user_visible_team_ids())
  )
  WITH CHECK (
    voter_id = auth.uid()
    AND team_id IN (SELECT public.user_visible_team_ids())
  );

CREATE POLICY "Members can delete own motm_votes"
  ON public.motm_votes FOR DELETE
  USING (voter_id = auth.uid());

-- ============================================================
-- 7) STORAGE : SELECT scopé à l'équipe + verrous manquants
-- ============================================================

-- --- gallery : objets liés à une ligne gallery_media de l'équipe
DROP POLICY IF EXISTS "Members can view gallery" ON storage.objects;
CREATE POLICY "Members can view gallery"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'gallery'
    AND EXISTS (
      SELECT 1 FROM public.gallery_media gm
      WHERE gm.storage_path = storage.objects.name
        AND gm.team_id IN (SELECT public.user_visible_team_ids())
    )
  );

-- (INSERT/UPDATE/DELETE gallery scellés au dossier de l'uploader, repris de 030)
-- Les noms créés par 030 sont dropés ici aussi pour rester idempotent si 030 est appliquée.
DROP POLICY IF EXISTS "Authenticated can upload gallery" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update gallery" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete gallery" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own gallery objects" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own gallery objects" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own gallery objects" ON storage.objects;

CREATE POLICY "Users can upload own gallery objects"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'gallery'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Users can update own gallery objects"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'gallery'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Users can delete own gallery objects"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'gallery'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- --- physical_docs : SELECT coach/owner de l'équipe (dossier <team_id>/...)
DROP POLICY IF EXISTS "Team members can view physical_docs" ON storage.objects;
CREATE POLICY "Team members can view physical_docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'physical_docs'
    AND public.is_team_coach((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS "Coaches can upload physical_docs" ON storage.objects;
DROP POLICY IF EXISTS "Coaches can update physical_docs" ON storage.objects;
DROP POLICY IF EXISTS "Coaches can delete physical_docs" ON storage.objects;

CREATE POLICY "Coaches can upload physical_docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'physical_docs'
    AND auth.role() = 'authenticated'
    AND public.is_team_coach((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Coaches can update physical_docs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'physical_docs'
    AND public.is_team_coach((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Coaches can delete physical_docs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'physical_docs'
    AND public.is_team_coach((storage.foldername(name))[1]::uuid)
  );

-- --- challenge_media : SELECT équipe + upload avec dossier joueur vérifié
DROP POLICY IF EXISTS "Members can view challenge_media" ON storage.objects;
CREATE POLICY "Members can view challenge_media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'challenge_media'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.user_visible_team_ids())
  );

DROP POLICY IF EXISTS "Members can upload challenge_media" ON storage.objects;
CREATE POLICY "Members can upload challenge_media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'challenge_media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.user_team_ids())
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own challenge_media" ON storage.objects;
CREATE POLICY "Users can delete own challenge_media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'challenge_media'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- --- club_feed : SELECT/UPDATE/DELETE membres du club (dossier <club_id>/...)
DROP POLICY IF EXISTS "Public read club_feed" ON storage.objects;
DROP POLICY IF EXISTS "Members update club_feed" ON storage.objects;
DROP POLICY IF EXISTS "Club members can view club_feed" ON storage.objects;
DROP POLICY IF EXISTS "Club members can update club_feed" ON storage.objects;
DROP POLICY IF EXISTS "Club members can delete club_feed" ON storage.objects;

CREATE POLICY "Club members can view club_feed"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'club_feed'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.user_club_ids())
  );

CREATE POLICY "Club members can update club_feed"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'club_feed'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.user_club_ids())
  );

CREATE POLICY "Club members can delete club_feed"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'club_feed'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.user_club_ids())
  );
