-- ============================================================
-- BENCHRS — Migrations requises (lot club & comité + suppression président)
-- Regroupe les fichiers NOUVEAUX et MODIFIÉS de ce lot, dans l'ordre numérique.
-- À appliquer dans cet ordre, en une seule exécution dans l'éditeur SQL Supabase.
--
-- ORDRE   FICHIER                              STATUT
-- 048     club_roles (MODIFIÉ)                 enum('comite') + is_club_committee
-- 049     club_fff_identity (MODIFIÉ)          is_club_committee
-- 063     enrichment_feed_notebook (MODIFIÉ)   is_club_committee
-- 072     security_fixes (MODIFIÉ)             invite code club
-- 110     club_finance_licences (NOUVEAU)
-- 111     club_polls (NOUVEAU)
-- 112     club_volunteers (NOUVEAU)
-- 113     club_documents (NOUVEAU)
-- 114     club_discipline (NOUVEAU)
-- 115     equipment_orders (NOUVEAU)
-- 116     board_meetings (NOUVEAU)
-- 117     club_newsletters (NOUVEAU)
-- 118     staff_qualifications (NOUVEAU)
-- 119     club_special_events (NOUVEAU)
-- 120     club_sponsors (NOUVEAU)
-- 121     club_ideas (NOUVEAU)
-- 122     club_album (NOUVEAU)
-- 123     club_staff_roles (NOUVEAU)
-- 124     remove_president_role (NOUVEAU, défensif/idempotent)
-- ============================================================

-- ============================================================
-- FICHIER : 048_club_roles.sql
-- ============================================================
-- 048_club_roles.sql
-- Rôle comité : visibilité (lecture) sur toutes les équipes d'un club.
-- Un membre du comité (role 'comite') voit l'ensemble des équipes de son club
-- en lecture seule via la fonction user_visible_team_ids(). Les coachs/owners gardent leurs droits.

-- Enum des rôles club (un seul rôle : comite — le poste de président n'existe plus)
DO $$ BEGIN
  CREATE TYPE club_member_role AS ENUM ('comite');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Membres du club (niveau club, distinct de team_members)
CREATE TABLE IF NOT EXISTS public.club_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role club_member_role NOT NULL DEFAULT 'comite',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_club_members_club ON public.club_members(club_id);
CREATE INDEX IF NOT EXISTS idx_club_members_user ON public.club_members(user_id);

ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;

-- Helper : clubs visibles = clubs où l'on est membre du comité + clubs de ses équipes
CREATE OR REPLACE FUNCTION public.user_club_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT club_id FROM public.club_members WHERE user_id = auth.uid()
  UNION
  SELECT t.club_id FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  WHERE tm.user_id = auth.uid();
$$;

-- Helper : équipes visibles = membres d'équipe + équipes des clubs du comité
CREATE OR REPLACE FUNCTION public.user_visible_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
  UNION
  SELECT t.id FROM public.teams t
  JOIN public.club_members cm ON cm.club_id = t.club_id
  WHERE cm.user_id = auth.uid();
$$;

-- Helper : est-on membre du comité (ou créateur) du club ?
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

-- RLS club_members
DROP POLICY IF EXISTS "Members can view club_members" ON public.club_members;
CREATE POLICY "Members can view club_members"
  ON public.club_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR club_id IN (SELECT public.user_club_ids())
  );

DROP POLICY IF EXISTS "Presidents can manage club_members" ON public.club_members;
DROP POLICY IF EXISTS "Committee can manage club_members" ON public.club_members;
CREATE POLICY "Committee can manage club_members"
  ON public.club_members FOR ALL
  USING (public.is_club_committee(club_id))
  WITH CHECK (public.is_club_committee(club_id));

-- RLS clubs : le comité voit son club
DROP POLICY IF EXISTS "Members can view their club" ON public.clubs;
CREATE POLICY "Members can view their club"
  ON public.clubs FOR SELECT
  USING (id IN (SELECT public.user_club_ids()));

-- ============================================================
-- Extension des policies SELECT à user_visible_team_ids() (lecture club)
-- ============================================================

-- Cas particuliers (noms de policy différents du pattern générique)
DROP POLICY IF EXISTS "Members can view their teams" ON public.teams;
CREATE POLICY "Members can view their teams"
  ON public.teams FOR SELECT
  USING (id IN (SELECT public.user_visible_team_ids()));

DROP POLICY IF EXISTS "Members can view their team membership" ON public.team_members;
CREATE POLICY "Members can view their team membership"
  ON public.team_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR team_id IN (SELECT public.user_visible_team_ids())
  );

DROP POLICY IF EXISTS "Members can view team profiles" ON public.profiles;
CREATE POLICY "Members can view team profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR team_id IS NULL
    OR team_id IN (SELECT public.user_visible_team_ids())
  );

-- Pattern générique "Members can view <table>" sur team_id
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'events', 'attendances', 'training_sessions', 'match_stats', 'match_events',
    'match_ratings', 'match_player_ratings', 'motm_votes', 'formations', 'match_lineups',
    'match_reports', 'season_cycles', 'team_settings', 'session_rpe', 'player_physical_tests',
    'weekly_challenge_settings', 'weekly_challenges', 'challenge_submissions',
    'exercise_library', 'gallery_media', 'championships', 'tasks', 'trophies',
    'licences', 'cotisations', 'carpooling_trips', 'carpooling_bookings',
    'fitness_ratings', 'injuries', 'chat_channels', 'chat_members', 'chat_messages'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Members can view %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Members can view %s" ON public.%I FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()))',
      t, t
    );
  END LOOP;
END $$;


-- ============================================================
-- FICHIER : 049_club_fff_identity.sql
-- ============================================================
-- 049_club_fff_identity.sql
-- Identité canonique des clubs : numéro d'affiliation FFF (unique, 6 chiffres).
-- Le nom devient un simple libellé d'affichage ; la déduplication se fait par numéro FFF
-- (un même club réel = un seul row clubs, quelle que soit l'orthographe du nom : ECC, ecc,
-- Etoile Club de Camphin, ...). Les variantes de nom sont gérées par club_aliases.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Numéro d'affiliation FFF (nullable : les clubs existants n'en ont pas encore)
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS fff_number TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS name_normalized TEXT;

-- Unicité canonique (index partiel : NULL autorisé, jamais de doublon entre 2 clubs)
DROP INDEX IF EXISTS clubs_fff_number_key;
CREATE UNIQUE INDEX clubs_fff_number_key ON public.clubs (fff_number) WHERE fff_number IS NOT NULL;

-- Contrainte de format : 6 chiffres exactement (ou NULL)
DO $$ BEGIN
  ALTER TABLE public.clubs DROP CONSTRAINT IF EXISTS clubs_fff_number_check;
  ALTER TABLE public.clubs ADD CONSTRAINT clubs_fff_number_check
    CHECK (fff_number IS NULL OR fff_number ~ '^[0-9]{6}$');
END $$;

-- Index pour la recherche de nom (fallback / autocomplétion)
CREATE INDEX IF NOT EXISTS clubs_name_normalized_idx ON public.clubs (name_normalized);
CREATE INDEX IF NOT EXISTS clubs_name_trgm_idx ON public.clubs USING gin (name gin_trgm_ops);

-- Variantes de nom du club (acronymes, noms d'usage) : "ECC" -> Etoile Club de Camphin
CREATE TABLE IF NOT EXISTS public.club_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_club_aliases_club ON public.club_aliases(club_id);

ALTER TABLE public.club_aliases ENABLE ROW LEVEL SECURITY;

-- Membres du club (team_members + comité) : lecture
DROP POLICY IF EXISTS "Members can view club_aliases" ON public.club_aliases;
CREATE POLICY "Members can view club_aliases"
  ON public.club_aliases FOR SELECT
  USING (club_id IN (SELECT public.user_club_ids()));

-- Comité (ou créateur) : gestion des alias
DROP POLICY IF EXISTS "Presidents can manage club_aliases" ON public.club_aliases;
DROP POLICY IF EXISTS "Committee can manage club_aliases" ON public.club_aliases;
CREATE POLICY "Committee can manage club_aliases"
  ON public.club_aliases FOR ALL
  USING (public.is_club_committee(club_id))
  WITH CHECK (public.is_club_committee(club_id));


-- ============================================================
-- FICHIER : 063_enrichment_feed_notebook.sql
-- ============================================================
-- 063 : Enrichissement profil joueur + journal d'activité + fil d'actualité club
--        + carnet de match + alerte temps de jeu + relances auto + planning éducateurs

-- ---------- 1. Profil joueur enrichi ----------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_foot TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS height_cm INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5,1);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS secondary_positions TEXT[] NOT NULL DEFAULT '{}';

-- ---------- 2. Journal d'activité (club-wide) ----------
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_team_created ON activity_logs(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_club_created ON activity_logs(club_id, created_at DESC);
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view activity logs" ON activity_logs
  FOR SELECT USING (
    team_id IN (SELECT public.user_visible_team_ids())
    OR (club_id IS NOT NULL AND club_id IN (SELECT public.user_club_ids()))
  );
CREATE POLICY "Members insert activity logs" ON activity_logs
  FOR INSERT WITH CHECK (
    team_id IN (SELECT public.user_visible_team_ids())
    OR (club_id IS NOT NULL AND club_id IN (SELECT public.user_club_ids()))
  );
CREATE POLICY "Coaches delete activity logs" ON activity_logs
  FOR DELETE USING (
    public.is_team_coach(team_id)
    OR (club_id IS NOT NULL AND public.is_club_committee(club_id))
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON activity_logs TO authenticated;

-- ---------- 3. Fil d'actualité du club ----------
CREATE TABLE IF NOT EXISTS club_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  media_url TEXT,
  storage_path TEXT,
  media_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_club_posts_club_created ON club_posts(club_id, created_at DESC);
ALTER TABLE club_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club members view posts" ON club_posts
  FOR SELECT USING (
    team_id IN (SELECT public.user_visible_team_ids())
    OR club_id IN (SELECT public.user_club_ids())
  );
CREATE POLICY "Club members insert posts" ON club_posts
  FOR INSERT WITH CHECK (
    team_id IN (SELECT public.user_visible_team_ids())
    OR club_id IN (SELECT public.user_club_ids())
  );
CREATE POLICY "Coaches delete posts" ON club_posts
  FOR DELETE USING (
    public.is_team_coach(team_id)
    OR public.is_club_committee(club_id)
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON club_posts TO authenticated;

-- Bucket de stockage public dédié au fil d'actualité (photos/vidéos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('club_feed', 'club_feed', true, 15728640, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime'])
ON CONFLICT (id) DO NOTHING;

-- Chemins : club_feed/<club_id>/<post_id>.<ext>
CREATE POLICY "Public read club_feed" ON storage.objects
  FOR SELECT USING (bucket_id = 'club_feed');

CREATE POLICY "Members upload club_feed" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'club_feed'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1]::uuid IN (SELECT public.user_club_ids())
      OR (storage.foldername(name))[1]::uuid IN (
        SELECT t.club_id FROM teams t
        WHERE t.id IN (SELECT public.user_visible_team_ids()) AND t.club_id IS NOT NULL
      )
    )
  );

CREATE POLICY "Members update club_feed" ON storage.objects
  FOR UPDATE USING (bucket_id = 'club_feed' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'club_feed' AND auth.role() = 'authenticated');

CREATE POLICY "Coaches delete club_feed" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'club_feed'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1]::uuid IN (SELECT public.user_club_ids())
      OR public.is_team_coach((storage.foldername(name))[1]::uuid)
    )
  );

-- ---------- 4. Carnet de match du joueur ----------
CREATE TABLE IF NOT EXISTS player_notebook_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  performance INTEGER NOT NULL DEFAULT 5 CHECK (performance BETWEEN 1 AND 10),
  notable_events TEXT,
  improvements TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_notebook_player ON player_notebook_entries(player_id, created_at DESC);
ALTER TABLE player_notebook_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view notebook entries" ON player_notebook_entries
  FOR SELECT USING (
    team_id IN (SELECT public.user_visible_team_ids())
    OR player_id = auth.uid()
  );
CREATE POLICY "Players manage own notebook" ON player_notebook_entries
  FOR ALL USING (player_id = auth.uid()) WITH CHECK (player_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON player_notebook_entries TO authenticated;

-- ---------- 5. Réglages temps de jeu + relances ----------
ALTER TABLE team_settings ADD COLUMN IF NOT EXISTS min_playing_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE team_settings ADD COLUMN IF NOT EXISTS attendance_reminders_enabled BOOLEAN NOT NULL DEFAULT true;

-- ---------- 6. Planning éducateurs ----------
-- Répartition par exercice : chaque exercice de la fiche (exercise_index = position
-- dans la séance, 0-based) a UN responsable. exercise_index NULL = anciennes
-- affectations au niveau de l'événement (conservées en lecture).
CREATE TABLE IF NOT EXISTS educator_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  exercise_index INTEGER,
  role TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- UNIQUE partiel : une seule affectation par exercice (NULLs libres = événement)
CREATE UNIQUE INDEX IF NOT EXISTS educator_plans_exercise_uq
  ON educator_plans(team_id, event_id, exercise_index) WHERE exercise_index IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_educator_plans_team ON educator_plans(team_id, created_at DESC);
ALTER TABLE educator_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view educator plans" ON educator_plans
  FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()));
CREATE POLICY "Coaches manage educator plans" ON educator_plans
  FOR ALL USING (public.is_team_coach(team_id)) WITH CHECK (public.is_team_coach(team_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON educator_plans TO authenticated;


-- ============================================================
-- FICHIER : 072_security_fixes.sql
-- ============================================================
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

-- Backfill pour les clubs existants (le comité peut le régénérer dans Réglages)
UPDATE public.clubs
SET comite_invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
WHERE comite_invite_code IS NULL OR comite_invite_code = '';

-- ============================================================
-- 2) PROFILES : + garde auth.uid() IS NOT NULL sur la lecture
--    des profils sans équipe.
--    Le contrôle « le rôle ne change pas » passe par le trigger
--    prevent_self_role_change (ci-dessous) : NEW/OLD ne sont pas
--    disponibles dans les policies RLS sur PostgreSQL < 15
--    (erreur 42P01 "missing FROM-clause entry for table new").
-- ============================================================
DROP POLICY IF EXISTS "Coaches can update any profile" ON public.profiles;
CREATE POLICY "Coaches can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.is_global_coach())
  WITH CHECK (public.is_global_coach());

-- Remplace le trigger de 071 (self-only) : bloque TOUT changement de
-- rôle côté client (que le user modifie sa propre fiche ou qu'un coach
-- en modifie une autre). Seul le service role (auth.uid() IS NULL,
-- routes /api/auth/* via l'admin client) peut modifier profiles.role.
CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Impossible de modifier le rôle côté client';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_no_self_role_change ON public.profiles;
CREATE TRIGGER trg_profiles_no_self_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_change();

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


-- ============================================================
-- FICHIER : 110_club_finance_licences.sql
-- ============================================================
-- 110_club_finance_licences.sql
-- Le comité gère l'administratif de TOUT le club, pas de l'équipe sélectionnée.
--
-- Trois permissions à l'échelle du club, du point de vue du comité
-- (`club_members` : comité — le poste de président n'existe plus) :
--   1. cotisations  — définir/encaisser/déduire sur toutes les équipes ;
--   2. licences     — suivi des dossiers FFF de toutes les équipes ;
--   3. trésorerie   — enregistrer une entrée/dépense pour n'importe quelle
--      équipe du club (lecture déjà élargie par la migration 056).
--
-- Contexte : les policies « Members can manage … » de la migration 005
-- passaient par `team_members` : le comité, qui n'est PAS membre d'une équipe,
-- voyait les données (048 a élargi le SELECT) mais ne pouvait RIEN écrire.
-- La page cotisations/trésorerie est pourtant réservée au club.
--
-- Pattern : mêmes vérifications que `public.is_team_coach` (071) — JAMAIS de
-- sous-query sur la table protégée dans une policy RLS, on passe par une
-- fonction SECURITY DEFINER.

-- Helper : l'appelant est-il membre du comité d'un club auquel appartient
-- l'équipe `p_team_id` ?
-- `p_user_id` par défaut = auth.uid() → utilisable tel quel dans les policies
-- RLS ; les routes serveur (service role, où auth.uid() est NULL) le passent
-- explicitement.
CREATE OR REPLACE FUNCTION public.is_club_committee_for_team(p_team_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_members cm
    JOIN public.teams t ON t.club_id = cm.club_id
    WHERE cm.user_id = p_user_id
      AND t.id = p_team_id
      AND cm.role = 'comite'
  );
$$;

-- Cotisations : le comité définit/encaisse/déduit pour toutes les équipes.
DROP POLICY IF EXISTS "Members can manage cotisations" ON cotisations;
CREATE POLICY "Members can manage cotisations"
  ON cotisations FOR ALL
  USING (public.is_team_coach(team_id) OR public.is_club_committee_for_team(team_id))
  WITH CHECK (public.is_team_coach(team_id) OR public.is_club_committee_for_team(team_id));

-- Licences : saisie du suivi des dossiers par le coach de l'équipe OU le comité.
DROP POLICY IF EXISTS "Members can manage licences" ON licences;
CREATE POLICY "Members can manage licences"
  ON licences FOR ALL
  USING (public.is_team_coach(team_id) OR public.is_club_committee_for_team(team_id))
  WITH CHECK (public.is_team_coach(team_id) OR public.is_club_committee_for_team(team_id));

-- La table licences n'a JAMAIS reçu de GRANT (seul 000 l'a créée, politiques
-- permissives puis 005) : le client authenticated ne pouvait pas y accéder au
-- niveau privilèges PostgreSQL, quelles que soient les policies RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON licences TO authenticated;

-- Une seule ligne de licence par joueur et par saison : rend l'upsert
-- `onConflict: "team_id,player_id,season"` possible (la page /admin/licences).
-- La table étant récente et vide, on conserve la première ligne par doublon.
DELETE FROM public.licences a
USING public.licences b
WHERE a.id > b.id
  AND a.team_id = b.team_id
  AND a.player_id = b.player_id
  AND a.season = b.season;
CREATE UNIQUE INDEX IF NOT EXISTS licences_team_player_season_uq
  ON public.licences(team_id, player_id, season);

-- Trésorerie : ajout d'entrée/dépense possible aussi par le comité.
DROP POLICY IF EXISTS "Coaches can manage treasury_transactions" ON treasury_transactions;
CREATE POLICY "Coaches can manage treasury_transactions"
  ON treasury_transactions FOR ALL
  USING (public.is_team_coach(team_id) OR public.is_club_committee_for_team(team_id))
  WITH CHECK (public.is_team_coach(team_id) OR public.is_club_committee_for_team(team_id));

-- ============================================================
-- FICHIER : 111_club_polls.sql
-- ============================================================
-- 111_club_polls.sql
-- Sondages du club : le comité lance un sondage (question + options,
-- choix unique ou multiple, fermeture optionnelle), les membres du club
-- votent (un seul vote par personne et par sondage).
--
-- RLS :
--   * club_polls        — SELECT par adhésion au club (user_club_ids, 048) ;
--     INSERT/UPDATE/DELETE réservés au comité.
--   * club_poll_votes   — SELECT via le sondage (club visible), chaque
--     utilisateur ne gère QUE sa propre ligne.

-- Helper : l'utilisateur est-il « membre du club » ?
-- Comité (`club_members`) OU membre (joueur/parent/coach) d'une équipe
-- du club (`team_members` → `teams.club_id`). Permet aux familles de voter
-- et voir les sondages sans être elles-mêmes au comité.
CREATE OR REPLACE FUNCTION public.is_club_member(p_club_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = p_club_id AND cm.user_id = p_user_id
    UNION ALL
    SELECT 1
    FROM public.teams t
    JOIN public.team_members tm ON tm.team_id = t.id
    WHERE t.club_id = p_club_id AND tm.user_id = p_user_id
  );
$$;

create table if not exists public.club_polls (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  question text not null check (char_length(question) <= 300),
  options jsonb not null default '[]'::jsonb,
  multiple boolean not null default false,
  closes_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.club_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.club_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_values jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (poll_id, user_id)
);

create index if not exists idx_club_polls_club ON public.club_polls(club_id);
create index if not exists idx_club_poll_votes_poll ON public.club_poll_votes(poll_id);

alter table public.club_polls enable row level security;
alter table public.club_poll_votes enable row level security;

drop policy if exists "Club members view polls" ON public.club_polls;
create policy "Club members view polls"
  ON public.club_polls FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage polls" ON public.club_polls;
create policy "Committee manage polls"
  ON public.club_polls FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Club members view poll votes" ON public.club_poll_votes;
create policy "Club members view poll votes"
  ON public.club_poll_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_polls p
      WHERE p.id = poll_id
        AND public.is_club_member(p.club_id)
    )
  );

drop policy if exists "Voters insert own vote" ON public.club_poll_votes;
create policy "Voters insert own vote"
  ON public.club_poll_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.club_polls p
      WHERE p.id = poll_id
        AND public.is_club_member(p.club_id)
    )
  );

drop policy if exists "Voters update own vote" ON public.club_poll_votes;
create policy "Voters update own vote"
  ON public.club_poll_votes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

drop policy if exists "Voters delete own vote" ON public.club_poll_votes;
create policy "Voters delete own vote"
  ON public.club_poll_votes FOR DELETE
  USING (auth.uid() = user_id);

grant select, insert, update, delete on public.club_polls TO authenticated;
grant select, insert, update, delete on public.club_poll_votes TO authenticated;

-- ============================================================
-- FICHIER : 112_club_volunteers.sql
-- ============================================================
-- 112_club_volunteers.sql
-- Bénévoles & buvette : le comité ouvre des créneaux de volontariat
-- (buvette, encadrement, arbitrage…) pour un événement ; les membres du
-- club s'inscrivent sur un créneau (limite `needed` respectée côté code).
--
-- RLS :
--   * club_volunteer_slots      — SELECT par adhésion au club, gestion
--     (INSERT/UPDATE/DELETE) réservée au comité.
--   * club_volunteer_signups    — SELECT par adhésion au club (via le
--     créneau), chaque utilisateur ne gère QUE sa propre inscription.

create table if not exists public.club_volunteer_slots (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  title text not null check (char_length(title) <= 200),
  category text not null default 'benevole'
    check (category IN ('benevole', 'buvette', 'accompagnement', 'arbitrage', 'autre')),
  event_date timestamptz,
  location text,
  start_time timestamptz,
  end_time timestamptz,
  needed int not null default 1 check (needed >= 1 AND needed <= 100),
  status text not null default 'open'
    check (status IN ('open', 'closed', 'cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.club_volunteer_signups (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.club_volunteer_slots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  unique (slot_id, user_id)
);

create index if not exists idx_club_volunteer_slots_club ON public.club_volunteer_slots(club_id);
create index if not exists idx_club_volunteer_signups_slot ON public.club_volunteer_signups(slot_id);

alter table public.club_volunteer_slots enable row level security;
alter table public.club_volunteer_signups enable row level security;

drop policy if exists "Club members view volunteer slots" ON public.club_volunteer_slots;
create policy "Club members view volunteer slots"
  ON public.club_volunteer_slots FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage volunteer slots" ON public.club_volunteer_slots;
create policy "Committee manage volunteer slots"
  ON public.club_volunteer_slots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Club members view volunteer signups" ON public.club_volunteer_signups;
create policy "Club members view volunteer signups"
  ON public.club_volunteer_signups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_volunteer_slots s
      WHERE s.id = slot_id
        AND public.is_club_member(s.club_id)
    )
  );

drop policy if exists "Volunteers insert own signup" ON public.club_volunteer_signups;
create policy "Volunteers insert own signup"
  ON public.club_volunteer_signups FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.club_volunteer_slots s
      WHERE s.id = slot_id
        AND public.is_club_member(s.club_id)
    )
  );

drop policy if exists "Volunteers update own signup" ON public.club_volunteer_signups;
create policy "Volunteers update own signup"
  ON public.club_volunteer_signups FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

drop policy if exists "Volunteers delete own signup" ON public.club_volunteer_signups;
create policy "Volunteers delete own signup"
  ON public.club_volunteer_signups FOR DELETE
  USING (auth.uid() = user_id);

grant select, insert, update, delete ON public.club_volunteer_slots TO authenticated;
grant select, insert, update, delete ON public.club_volunteer_signups TO authenticated;

-- ============================================================
-- FICHIER : 113_club_documents.sql
-- ============================================================
-- 113_club_documents.sql
-- Documents & PV du club : dépôt de documents administratifs (règlement
-- intérieur, PV d'AG, budget voté, comptes-rendus…) consultables par les
-- membres du club.
--
-- Stockage : bucket privé `club_documents`, chemins
-- `club_documents/<club_id>/<uuid>.<ext>` (club = foldername[2]).
-- Upload/delete par le comité, lecture par les membres du club (PII/fichiers
-- sensibles → bucket privé, rendus par URL signée).
--
-- RLS :
--   * club_documents — SELECT par adhésion au club, gestion comité.
--   * storage.objects — SELECT club visible, INSERT/UPDATE/DELETE comité.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'club_documents',
  'club_documents',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

create table if not exists public.club_documents (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  category text not null default 'autre'
    check (category IN ('reglement', 'pv', 'budget', 'compte_rendu', 'actualite', 'autre')),
  title text not null check (char_length(title) <= 200),
  description text,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_club_documents_club ON public.club_documents(club_id);

alter table public.club_documents enable row level security;

drop policy if exists "Club members view documents" ON public.club_documents;
create policy "Club members view documents"
  ON public.club_documents FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage documents" ON public.club_documents;
create policy "Committee manage documents"
  ON public.club_documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

grant select, insert, update, delete ON public.club_documents TO authenticated;

-- ── storage.objects ────────────────────────────────────────────────
drop policy if exists "Club members view club_documents" ON storage.objects;
create policy "Club members view club_documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'club_documents'
    AND public.is_club_member((storage.foldername(name))[2]::uuid)
  );

drop policy if exists "Committee upload club_documents" ON storage.objects;
create policy "Committee upload club_documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'club_documents'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = (storage.foldername(name))[2]::uuid
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Committee update club_documents" ON storage.objects;
create policy "Committee update club_documents"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'club_documents'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = (storage.foldername(name))[2]::uuid
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Committee delete club_documents" ON storage.objects;
create policy "Committee delete club_documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'club_documents'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = (storage.foldername(name))[2]::uuid
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

-- ============================================================
-- FICHIER : 114_club_discipline.sql
-- ============================================================
-- 114_club_discipline.sql
-- Registre discipline du club : suspensions, cartons, exclusions à
-- l'échelle du club (visible par le comité, alimenté par le comité).
--
-- RLS : SELECT par adhésion au club, INSERT/UPDATE/DELETE comité.

create table if not exists public.club_discipline (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  season text not null,
  offense_type text not null default 'autre'
    check (offense_type IN ('carton_jaune', 'carton_rouge', 'suspension', 'exclusion', 'autre')),
  label text,
  reason text,
  incident_date date not null default CURRENT_DATE,
  end_date date,
  status text not null default 'active'
    check (status IN ('active', 'resolved')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_club_discipline_club ON public.club_discipline(club_id);
create index if not exists idx_club_discipline_player ON public.club_discipline(player_id);

alter table public.club_discipline enable row level security;

drop policy if exists "Club members view discipline" ON public.club_discipline;
create policy "Club members view discipline"
  ON public.club_discipline FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage discipline" ON public.club_discipline;
create policy "Committee manage discipline"
  ON public.club_discipline FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

grant select, insert, update, delete ON public.club_discipline TO authenticated;

-- ============================================================
-- FICHIER : 115_equipment_orders.sql
-- ============================================================
-- 115_equipment_orders.sql
-- Commandes groupées d'équipement (maillots, survêtements…) :
--   * le comité crée une commande (title, saison, statut, date de clôture) et
--     y attache des articles (nom + liste de tailles proposées) ;
--   * chaque membre du club choisit une taille par article et par joueur
--     (le joueur est un profils de l'une des équipes du club, ou un enfant
--     lié `parent_student`) ;
--   * le comité consulte la synthèse des tailles et passe la commande en
--     « livrée » une fois la distribution faite.
--
-- RLS : lecture par adhésion au club (`is_club_member`, 111) ; gestion des
-- commandes/articles = comité ; chaque membre ne gère QUE ses propres choix
-- (un parent peut choisir pour ses enfants liés).

create table if not exists public.equipment_orders (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null check (char_length(title) <= 150),
  season text,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'closed', 'delivered', 'cancelled')),
  description text,
  closes_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.equipment_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.equipment_orders(id) on delete cascade,
  name text not null check (char_length(name) <= 120),
  sizes text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.equipment_choices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.equipment_orders(id) on delete cascade,
  item_id uuid not null references public.equipment_items(id) on delete cascade,
  player_id uuid references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  size text not null check (char_length(size) <= 30),
  quantity integer not null default 1 check (quantity between 1 and 10),
  note text,
  created_at timestamptz not null default now(),
  unique (order_id, item_id, player_id, user_id)
);

create index if not exists idx_equipment_orders_club ON public.equipment_orders(club_id);
create index if not exists idx_equipment_items_order ON public.equipment_items(order_id);
create index if not exists idx_equipment_choices_order ON public.equipment_choices(order_id);

alter table public.equipment_orders enable row level security;
alter table public.equipment_items enable row level security;
alter table public.equipment_choices enable row level security;

-- Commandes
drop policy if exists "Club members view equipment orders" ON public.equipment_orders;
create policy "Club members view equipment orders"
  ON public.equipment_orders FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage equipment orders" ON public.equipment_orders;
create policy "Committee manage equipment orders"
  ON public.equipment_orders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

-- Articles (via la commande)
drop policy if exists "Club members view equipment items" ON public.equipment_items;
create policy "Club members view equipment items"
  ON public.equipment_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.equipment_orders o
      WHERE o.id = order_id AND public.is_club_member(o.club_id)
    )
  );

drop policy if exists "Committee manage equipment items" ON public.equipment_items;
create policy "Committee manage equipment items"
  ON public.equipment_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.equipment_orders o
      JOIN public.club_members cm ON cm.club_id = o.club_id
      WHERE o.id = order_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.equipment_orders o
      JOIN public.club_members cm ON cm.club_id = o.club_id
      WHERE o.id = order_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

-- Choix : lecture par adhésion, gestion du comité OU de soi-même (ou de ses enfants)
drop policy if exists "Club members view equipment choices" ON public.equipment_choices;
create policy "Club members view equipment choices"
  ON public.equipment_choices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.equipment_orders o
      WHERE o.id = order_id AND public.is_club_member(o.club_id)
    )
  );

drop policy if exists "Committee manage equipment choices" ON public.equipment_choices;
create policy "Committee manage equipment choices"
  ON public.equipment_choices FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.equipment_orders o
      JOIN public.club_members cm ON cm.club_id = o.club_id
      WHERE o.id = order_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.equipment_orders o
      JOIN public.club_members cm ON cm.club_id = o.club_id
      WHERE o.id = order_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Members insert own equipment choice" ON public.equipment_choices;
create policy "Members insert own equipment choice"
  ON public.equipment_choices FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.equipment_orders o
      WHERE o.id = order_id AND public.is_club_member(o.club_id)
    )
    AND (
      player_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.equipment_orders o
        JOIN public.teams t ON t.club_id = o.club_id
        JOIN public.team_members tm ON tm.team_id = t.id
        WHERE o.id = order_id AND tm.user_id = player_id AND tm.role = 'player'
      )
      OR EXISTS (
        SELECT 1
        FROM public.equipment_orders o
        JOIN public.teams t ON t.club_id = o.club_id
        JOIN public.team_members tm ON tm.team_id = t.id
        JOIN public.parent_student ps
          ON ps.student_id = tm.user_id AND ps.parent_id = user_id
        WHERE o.id = order_id AND tm.user_id = player_id AND tm.role = 'player'
      )
    )
  );

drop policy if exists "Members update own equipment choice" ON public.equipment_choices;
create policy "Members update own equipment choice"
  ON public.equipment_choices FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

drop policy if exists "Members delete own equipment choice" ON public.equipment_choices;
create policy "Members delete own equipment choice"
  ON public.equipment_choices FOR DELETE
  USING (auth.uid() = user_id);

grant select, insert, update, delete on public.equipment_orders TO authenticated;
grant select, insert, update, delete on public.equipment_items TO authenticated;
grant select, insert, update, delete on public.equipment_choices TO authenticated;

-- ============================================================
-- FICHIER : 116_board_meetings.sql
-- ============================================================
-- 116_board_meetings.sql
-- Réunions du bureau & décisions :
--   * le comité convoque une réunion (date, heure, lieu, ordre du jour) ;
--   * une fois tenue, des décisions y sont rattachées (proposée / adoptée /
--     rejetée) et les membres du comité votent (pour / contre / abstention) ;
--   * les votes servent de décompte : la décision est validée ou non.
--
-- RLS : lecture par adhésion au club (`is_club_member`, 111) ; gestion
-- (réunions + décisions) = comité ; votes = chaque membre du comité gère
-- seulement son propre vote.

create table if not exists public.board_meetings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  meeting_date date,
  start_time time,
  location text,
  status text not null default 'planned'
    check (status in ('planned', 'held', 'cancelled')),
  agenda jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.board_decisions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.board_meetings(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  description text,
  outcome text not null default 'proposed'
    check (outcome in ('proposed', 'adopted', 'rejected')),
  decided_by uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.board_votes (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.board_decisions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  choice text not null check (choice in ('pour', 'contre', 'abstention')),
  created_at timestamptz not null default now(),
  unique (decision_id, user_id)
);

create index if not exists idx_board_meetings_club ON public.board_meetings(club_id);
create index if not exists idx_board_decisions_meeting ON public.board_decisions(meeting_id);
create index if not exists idx_board_votes_decision ON public.board_votes(decision_id);

alter table public.board_meetings enable row level security;
alter table public.board_decisions enable row level security;
alter table public.board_votes enable row level security;

drop policy if exists "Club members view board meetings" ON public.board_meetings;
create policy "Club members view board meetings"
  ON public.board_meetings FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage board meetings" ON public.board_meetings;
create policy "Committee manage board meetings"
  ON public.board_meetings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Club members view board decisions" ON public.board_decisions;
create policy "Club members view board decisions"
  ON public.board_decisions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.board_meetings m
      WHERE m.id = meeting_id AND public.is_club_member(m.club_id)
    )
  );

drop policy if exists "Committee manage board decisions" ON public.board_decisions;
create policy "Committee manage board decisions"
  ON public.board_decisions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.board_meetings m
      JOIN public.club_members cm ON cm.club_id = m.club_id
      WHERE m.id = meeting_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_meetings m
      JOIN public.club_members cm ON cm.club_id = m.club_id
      WHERE m.id = meeting_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Club members view board votes" ON public.board_votes;
create policy "Club members view board votes"
  ON public.board_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.board_decisions d
      JOIN public.board_meetings m ON m.id = d.meeting_id
      WHERE d.id = decision_id AND public.is_club_member(m.club_id)
    )
  );

drop policy if exists "Committee members insert own vote" ON public.board_votes;
create policy "Committee members insert own vote"
  ON public.board_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.board_decisions d
      JOIN public.board_meetings m ON m.id = d.meeting_id
      JOIN public.club_members cm ON cm.club_id = m.club_id
      WHERE d.id = decision_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Committee members update own vote" ON public.board_votes;
create policy "Committee members update own vote"
  ON public.board_votes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

drop policy if exists "Committee members delete own vote" ON public.board_votes;
create policy "Committee members delete own vote"
  ON public.board_votes FOR DELETE
  USING (auth.uid() = user_id);

grant select, insert, update, delete on public.board_meetings TO authenticated;
grant select, insert, update, delete on public.board_decisions TO authenticated;
grant select, insert, update, delete on public.board_votes TO authenticated;

-- ============================================================
-- FICHIER : 117_club_newsletters.sql
-- ============================================================
-- 117_club_newsletters.sql
-- Newsletter du club : le comité rédige une lettre d'info (titre + contenu),
-- choisit la cible (tout le club ou une équipe) et programme l'envoi.
-- La livraison réutilise l'infrastructure des notifications existantes :
-- insert `notifications` type `club_newsletter` avec `scheduled_for`, le cron
-- `/api/notifications/cron` les délivre quand leur échéance est atteinte.
-- L'envoi immédiat est géré par la route `/api/clubs/newsletter`.
--
-- RLS : lecture par adhésion au club ; création/gestion = comité.

create table if not exists public.club_newsletters (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  content text not null check (char_length(content) <= 8000),
  audience text not null default 'all' check (audience in ('all', 'team')),
  team_id uuid references public.teams(id) on delete set null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sent', 'cancelled')),
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_club_newsletters_club ON public.club_newsletters(club_id);

alter table public.club_newsletters enable row level security;

drop policy if exists "Club members view newsletters" ON public.club_newsletters;
create policy "Club members view newsletters"
  ON public.club_newsletters FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage newsletters" ON public.club_newsletters;
create policy "Committee manage newsletters"
  ON public.club_newsletters FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

grant select, insert, update, delete on public.club_newsletters TO authenticated;

-- ============================================================
-- FICHIER : 118_staff_qualifications.sql
-- ============================================================
-- 118_staff_qualifications.sql
-- Diplômes & formations de l'encadrement : le comité enregistre les
-- qualifications (BMF, BE, UEFA A/B, BAFA, PSC1, autre) des membres de
-- l'encadrement (coachs/owners des équipes du club, comité), avec les dates
-- d'obtention et d'expiration. La page alerte sur les échéances et permet
-- d'envoyer un rappel de reconduction au membre concerné.
--
-- RLS : lecture par adhésion au club ; gestion = comité.

create table if not exists public.staff_qualifications (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  qualification text not null
    check (qualification in ('bmf', 'be', 'uefa_b', 'uefa_a', 'bafa', 'psc1', 'autre')),
  label text,
  issued_at date,
  expires_at date,
  notes text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (club_id, user_id, qualification)
);

create index if not exists idx_staff_qualifications_club ON public.staff_qualifications(club_id);

alter table public.staff_qualifications enable row level security;

drop policy if exists "Club members view staff qualifications" ON public.staff_qualifications;
create policy "Club members view staff qualifications"
  ON public.staff_qualifications FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage staff qualifications" ON public.staff_qualifications;
create policy "Committee manage staff qualifications"
  ON public.staff_qualifications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

grant select, insert, update, delete on public.staff_qualifications TO authenticated;

-- ============================================================
-- FICHIER : 119_club_special_events.sql
-- ============================================================
-- 119_club_special_events.sql
-- Événementiel spécial (tournoi, gala, match de gala…) :
--   * le comité annonce un événement (titre, description, date, lieu, prix
--     par place, capacité max) et l'ouvre aux inscriptions ;
--   * chaque membre du club s'inscrit (nombre de places, note) ;
--   * le jour J, le comité « pointe » les présents (émargement) et voit les
--     recettes cumulées (places × prix).
--
-- RLS : lecture par adhésion au club ; gestion des événements = comité ;
-- chacun gère SA ligne d'inscription (sauf check-in = comité).

create table if not exists public.club_special_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  description text,
  event_date date,
  start_time time,
  location text,
  price numeric(10,2) not null default 0 check (price >= 0),
  capacity integer not null default 0 check (capacity >= 0), -- 0 = illimité
  status text not null default 'announced'
    check (status in ('announced', 'open', 'closed', 'cancelled')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.club_event_attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.club_special_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  places integer not null default 1 check (places between 1 and 20),
  note text,
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists idx_club_special_events_club ON public.club_special_events(club_id);
create index if not exists idx_club_event_attendees_event ON public.club_event_attendees(event_id);

alter table public.club_special_events enable row level security;
alter table public.club_event_attendees enable row level security;

drop policy if exists "Club members view special events" ON public.club_special_events;
create policy "Club members view special events"
  ON public.club_special_events FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage special events" ON public.club_special_events;
create policy "Committee manage special events"
  ON public.club_special_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Club members view event attendees" ON public.club_event_attendees;
create policy "Club members view event attendees"
  ON public.club_event_attendees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_special_events e
      WHERE e.id = event_id AND public.is_club_member(e.club_id)
    )
  );

drop policy if exists "Members insert own attendance" ON public.club_event_attendees;
create policy "Members insert own attendance"
  ON public.club_event_attendees FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.club_special_events e
      WHERE e.id = event_id AND public.is_club_member(e.club_id)
    )
  );

drop policy if exists "Members update own attendance" ON public.club_event_attendees;
create policy "Members update own attendance"
  ON public.club_event_attendees FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND NOT checked_in
  );

drop policy if exists "Members delete own attendance" ON public.club_event_attendees;
create policy "Members delete own attendance"
  ON public.club_event_attendees FOR DELETE
  USING (auth.uid() = user_id);

drop policy if exists "Committee check attendance" ON public.club_event_attendees;
create policy "Committee check attendance"
  ON public.club_event_attendees FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.club_special_events e
      JOIN public.club_members cm ON cm.club_id = e.club_id
      WHERE e.id = event_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_special_events e
      JOIN public.club_members cm ON cm.club_id = e.club_id
      WHERE e.id = event_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

grant select, insert, update, delete on public.club_special_events TO authenticated;
grant select, insert, update, delete on public.club_event_attendees TO authenticated;

-- ============================================================
-- FICHIER : 120_club_sponsors.sql
-- ============================================================
-- 120_club_sponsors.sql
-- Partenaires & sponsors du club : encart « Nos partenaires » consultable par
-- les familles, géré par le comité.
--
-- Stockage : bucket privé `club_sponsors`, chemins
-- `club_sponsors/<club_id>/<uuid>.<ext>` (club = foldername[2]).
-- Upload/update/delete par le comité, lecture par les membres du club.
--
-- RLS :
--   * club_sponsors — SELECT par adhésion au club, gestion comité.
--   * storage.objects — SELECT club visible, INSERT/UPDATE/DELETE comité.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'club_sponsors',
  'club_sponsors',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

create table if not exists public.club_sponsors (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null check (char_length(name) <= 120),
  sponsor_type text not null default 'autre'
    check (sponsor_type IN ('commercant', 'institutionnel', 'club', 'autre')),
  amount numeric(10,2) not null default 0,
  season text,
  start_date date,
  end_date date,
  website text check (website IS NULL OR char_length(website) <= 300),
  logo_path text,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_club_sponsors_club ON public.club_sponsors(club_id);

alter table public.club_sponsors enable row level security;

drop policy if exists "Club members view sponsors" ON public.club_sponsors;
create policy "Club members view sponsors"
  ON public.club_sponsors FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Committee manage sponsors" ON public.club_sponsors;
create policy "Committee manage sponsors"
  ON public.club_sponsors FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

grant select, insert, update, delete ON public.club_sponsors TO authenticated;

-- ── storage.objects ────────────────────────────────────────────────
drop policy if exists "Club members view club_sponsors" ON storage.objects;
create policy "Club members view club_sponsors"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'club_sponsors'
    AND public.is_club_member((storage.foldername(name))[2]::uuid)
  );

drop policy if exists "Committee upload club_sponsors" ON storage.objects;
create policy "Committee upload club_sponsors"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'club_sponsors'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = (storage.foldername(name))[2]::uuid
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Committee update club_sponsors" ON storage.objects;
create policy "Committee update club_sponsors"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'club_sponsors'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = (storage.foldername(name))[2]::uuid
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Committee delete club_sponsors" ON storage.objects;
create policy "Committee delete club_sponsors"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'club_sponsors'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = (storage.foldername(name))[2]::uuid
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

-- ============================================================
-- FICHIER : 121_club_ideas.sql
-- ============================================================
-- 121_club_ideas.sql
-- Boîte à idées du club : les membres proposent des idées, tout le club vote,
-- le comité suit le statut (proposée / retenue / en cours / réalisée / refusée).
--
-- RLS :
--   * club_ideas — SELECT par adhésion au club, INSERT = auteur membre,
--     UPDATE/DELETE = comité OU auteur (chacun peut retirer son idée).
--   * club_idea_votes — un membre vote une seule fois par idée (UNIQUE),
--     chacun ne gère que SA ligne.

create table if not exists public.club_ideas (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) <= 140),
  description text not null check (char_length(description) <= 2000),
  status text not null default 'proposed'
    check (status IN ('proposed', 'selected', 'in_progress', 'done', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.club_idea_votes (
  idea_id uuid not null references public.club_ideas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

create index if not exists idx_club_ideas_club ON public.club_ideas(club_id);
create index if not exists idx_club_idea_votes_idea ON public.club_idea_votes(idea_id);

alter table public.club_ideas enable row level security;
alter table public.club_idea_votes enable row level security;

-- club_ideas
drop policy if exists "Club members view ideas" ON public.club_ideas;
create policy "Club members view ideas"
  ON public.club_ideas FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Club members propose ideas" ON public.club_ideas;
create policy "Club members propose ideas"
  ON public.club_ideas FOR INSERT
  WITH CHECK (
    public.is_club_member(club_id)
    AND user_id = auth.uid()
  );

drop policy if exists "Committee or author update ideas" ON public.club_ideas;
create policy "Committee or author update ideas"
  ON public.club_ideas FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Committee or author delete ideas" ON public.club_ideas;
create policy "Committee or author delete ideas"
  ON public.club_ideas FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

-- club_idea_votes
drop policy if exists "Club members view idea votes" ON public.club_idea_votes;
create policy "Club members view idea votes"
  ON public.club_idea_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_ideas i
      WHERE i.id = idea_id
        AND public.is_club_member(i.club_id)
    )
  );

drop policy if exists "Members manage own idea votes" ON public.club_idea_votes;
create policy "Members manage own idea votes"
  ON public.club_idea_votes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.club_ideas i
      WHERE i.id = idea_id
        AND public.is_club_member(i.club_id)
    )
  );

drop policy if exists "Members delete own idea vote" ON public.club_idea_votes;
create policy "Members delete own idea vote"
  ON public.club_idea_votes FOR DELETE
  USING (user_id = auth.uid());

grant select, insert, update, delete ON public.club_ideas TO authenticated;
grant select, insert, delete ON public.club_idea_votes TO authenticated;

-- ============================================================
-- FICHIER : 122_club_album.sql
-- ============================================================
-- 122_club_album.sql
-- Album souvenirs du club : photos du club par équipe avec légendes, les
-- familles uploadent et commentent.
--
-- Stockage : bucket privé `club_album`, chemins
-- `club_album/<club_id>/<user_id>/<uuid>.<ext>` (club = foldername[2],
-- utilisateur = foldername[3]).
-- Upload par les membres du club, suppression de SON upload (ou comité).
--
-- RLS :
--   * club_album_photos — SELECT par adhésion au club, INSERT = uploader
--     membre, UPDATE/DELETE = uploader OU comité.
--   * club_album_comments — visible par adhésion, chacun gère ses
--     commentaires, le comité peut modérer (DELETE).
--   * storage.objects — SELECT club visible, INSERT membre, UPDATE/DELETE =
--     propriétaire du dossier OU comité du club.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'club_album',
  'club_album',
  false,
  20971520,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

create table if not exists public.club_album_photos (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  caption text check (caption IS NULL OR char_length(caption) <= 300),
  taken_at date,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.club_album_comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.club_album_photos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists idx_club_album_club ON public.club_album_photos(club_id);
create index if not exists idx_club_album_team ON public.club_album_photos(team_id);
create index if not exists idx_club_album_comments_photo ON public.club_album_comments(photo_id);

alter table public.club_album_photos enable row level security;
alter table public.club_album_comments enable row level security;

-- club_album_photos
drop policy if exists "Club members view album photos" ON public.club_album_photos;
create policy "Club members view album photos"
  ON public.club_album_photos FOR SELECT
  USING (public.is_club_member(club_id));

drop policy if exists "Club members upload album photos" ON public.club_album_photos;
create policy "Club members upload album photos"
  ON public.club_album_photos FOR INSERT
  WITH CHECK (
    public.is_club_member(club_id)
    AND uploaded_by = auth.uid()
  );

drop policy if exists "Uploader or committee update album photos" ON public.club_album_photos;
create policy "Uploader or committee update album photos"
  ON public.club_album_photos FOR UPDATE
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  )
  WITH CHECK (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

drop policy if exists "Uploader or committee delete album photos" ON public.club_album_photos;
create policy "Uploader or committee delete album photos"
  ON public.club_album_photos FOR DELETE
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

-- club_album_comments
drop policy if exists "Club members view album comments" ON public.club_album_comments;
create policy "Club members view album comments"
  ON public.club_album_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_album_photos p
      WHERE p.id = photo_id
        AND public.is_club_member(p.club_id)
    )
  );

drop policy if exists "Members comment album" ON public.club_album_comments;
create policy "Members comment album"
  ON public.club_album_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.club_album_photos p
      WHERE p.id = photo_id
        AND public.is_club_member(p.club_id)
    )
  );

drop policy if exists "Author or committee delete album comments" ON public.club_album_comments;
create policy "Author or committee delete album comments"
  ON public.club_album_comments FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.club_album_photos p
        JOIN public.club_members cm ON cm.club_id = p.club_id
      WHERE p.id = photo_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'comite'
    )
  );

grant select, insert, update, delete ON public.club_album_photos TO authenticated;
grant select, insert, delete ON public.club_album_comments TO authenticated;

-- ── storage.objects ────────────────────────────────────────────────
drop policy if exists "Club members view club_album" ON storage.objects;
create policy "Club members view club_album"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'club_album'
    AND public.is_club_member((storage.foldername(name))[2]::uuid)
  );

drop policy if exists "Club members upload club_album" ON storage.objects;
create policy "Club members upload club_album"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'club_album'
    AND public.is_club_member((storage.foldername(name))[2]::uuid)
  );

drop policy if exists "Uploader or committee update club_album" ON storage.objects;
create policy "Uploader or committee update club_album"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'club_album'
    AND (storage.foldername(name))[3]::uuid = auth.uid()
    OR (
      bucket_id = 'club_album'
      AND EXISTS (
        SELECT 1 FROM public.club_members cm
        WHERE cm.club_id = (storage.foldername(name))[2]::uuid
          AND cm.user_id = auth.uid()
          AND cm.role = 'comite'
      )
    )
  );

drop policy if exists "Uploader or committee delete club_album" ON storage.objects;
create policy "Uploader or committee delete club_album"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'club_album'
    AND (storage.foldername(name))[3]::uuid = auth.uid()
    OR (
      bucket_id = 'club_album'
      AND EXISTS (
        SELECT 1 FROM public.club_members cm
        WHERE cm.club_id = (storage.foldername(name))[2]::uuid
          AND cm.user_id = auth.uid()
          AND cm.role = 'comite'
      )
    )
  );

-- ============================================================
-- FICHIER : 123_club_staff_roles.sql
-- ============================================================
-- 123_club_staff_roles.sql
-- Arbre des catégories : organigramme des responsables de chaque équipe
-- (adjoint, délégué de plateau, soigneur…) en complément du coach titulaire
-- (déjà connu via team_members). Imprimable, coordonnées affichées côté club.
--
-- RLS :
--   * SELECT — comité du club de l'équipe (toutes équipes, PII téléphone des
--     profils join en lecture) OU membre de l'équipe (sa catégorie).
--   * INSERT/UPDATE/DELETE — comité du club OU coach/owner de l'équipe
--     (public.is_team_coach, SECURITY DEFINER — jamais de sous-query brute
--     sur la table protégée).

create table if not exists public.club_staff_roles (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  staff_role text not null default 'adjoint'
    check (staff_role IN ('adjoint', 'delegue', 'physio', 'intendant', 'autre')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create index if not exists idx_club_staff_roles_team ON public.club_staff_roles(team_id);

alter table public.club_staff_roles enable row level security;

drop policy if exists "Club committee or team members view staff roles" ON public.club_staff_roles;
create policy "Club committee or team members view staff roles"
  ON public.club_staff_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND EXISTS (
          SELECT 1 FROM public.club_members cm
          WHERE cm.club_id = t.club_id
            AND cm.user_id = auth.uid()
            AND cm.role = 'comite'
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_id
        AND tm.user_id = auth.uid()
    )
  );

drop policy if exists "Committee or team coach manage staff roles" ON public.club_staff_roles;
create policy "Committee or team coach manage staff roles"
  ON public.club_staff_roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND EXISTS (
          SELECT 1 FROM public.club_members cm
          WHERE cm.club_id = t.club_id
            AND cm.user_id = auth.uid()
            AND cm.role = 'comite'
        )
    )
    OR public.is_team_coach(team_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND EXISTS (
          SELECT 1 FROM public.club_members cm
          WHERE cm.club_id = t.club_id
            AND cm.user_id = auth.uid()
            AND cm.role = 'comite'
        )
    )
    OR public.is_team_coach(team_id)
  );

grant select, insert, update, delete ON public.club_staff_roles TO authenticated;

-- ============================================================
-- FICHIER : 124_remove_president_role.sql
-- ============================================================
-- 124_remove_president_role.sql
-- Supprime le rôle 'president' de club_members : tous les membres du club sont désormais
-- de simples 'comite' (égalité, pas de couronne). Idempotent : ne fait rien si la migrations
-- 048 (et suivantes) n'a pas encore été appliquée EN L'ÉTAT (enum sans 'president').

-- 1. Si l'enum contient 'president' : rebasculer les lignes puis retirer la valeur.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'club_member_role' AND e.enumlabel = 'president'
  ) AND EXISTS (
    SELECT 1 FROM pg_type t WHERE t.typname = 'club_member_role'
  ) THEN
    UPDATE public.club_members SET role = 'comite' WHERE role = 'president';
    ALTER TYPE public.club_member_role DROP VALUE 'president';
  END IF;
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

