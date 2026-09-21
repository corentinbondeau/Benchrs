-- ============================================================
-- 103 : Migration consolidée — applique en un seul passage
-- tout le DDL manquant des migrations 042, 045, 059, 088, 101, 102.
-- Toutes les opérations sont idempotentes (IF NOT EXISTS / IF EXISTS).
-- ============================================================

-- ======================== 042 : ratings half-steps ========================

-- match_ratings (retour du coach)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='match_ratings' AND column_name='rating'
    AND data_type != 'numeric'
  ) THEN
    ALTER TABLE public.match_ratings DROP CONSTRAINT IF EXISTS match_ratings_rating_check;
    ALTER TABLE public.match_ratings ALTER COLUMN rating TYPE NUMERIC(3,1) USING rating::numeric;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_ratings_rating_check'
  ) THEN
    ALTER TABLE public.match_ratings ADD CONSTRAINT match_ratings_rating_check
      CHECK (rating = 0 OR (rating >= 1 AND rating <= 10 AND (rating * 2) % 1 = 0));
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- match_player_ratings (notes entre joueurs)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='match_player_ratings' AND column_name='rating'
    AND data_type != 'numeric'
  ) THEN
    ALTER TABLE public.match_player_ratings DROP CONSTRAINT IF EXISTS match_player_ratings_rating_check;
    ALTER TABLE public.match_player_ratings ALTER COLUMN rating TYPE NUMERIC(3,1) USING rating::numeric;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_player_ratings_rating_check'
  ) THEN
    ALTER TABLE public.match_player_ratings ADD CONSTRAINT match_player_ratings_rating_check
      CHECK (rating = 0 OR (rating >= 1 AND rating <= 10 AND (rating * 2) % 1 = 0));
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ======================== 045 : RPE tracking ========================

-- Nettoyage éventuel de l'ancienne team_settings (clé/valeur) si elle existe sans team_id
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='team_settings'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='team_settings' AND column_name='team_id'
  ) THEN
    DROP TABLE public.team_settings;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.team_settings (
  team_id UUID PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  enable_rpe BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view team_settings" ON public.team_settings;
CREATE POLICY "Members can view team_settings"
  ON public.team_settings FOR SELECT
  USING (team_id IN (SELECT public.user_team_ids()));

DROP POLICY IF EXISTS "Coaches can manage team_settings" ON public.team_settings;
CREATE POLICY "Coaches can manage team_settings"
  ON public.team_settings FOR ALL
  USING (public.is_team_coach(team_id))
  WITH CHECK (public.is_team_coach(team_id));

CREATE TABLE IF NOT EXISTS public.session_rpe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  rpe INTEGER CHECK (rpe >= 1 AND rpe <= 10),
  session_duration INTEGER CHECK (session_duration > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_session_rpe_event ON public.session_rpe(event_id);
CREATE INDEX IF NOT EXISTS idx_session_rpe_player ON public.session_rpe(player_id);
CREATE INDEX IF NOT EXISTS idx_session_rpe_team_event ON public.session_rpe(team_id, event_id);

ALTER TABLE public.session_rpe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view session_rpe" ON public.session_rpe;
CREATE POLICY "Members can view session_rpe"
  ON public.session_rpe FOR SELECT
  USING (team_id IN (SELECT public.user_team_ids()));

DROP POLICY IF EXISTS "Players can manage own session_rpe" ON public.session_rpe;
CREATE POLICY "Players can manage own session_rpe"
  ON public.session_rpe FOR ALL
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);


-- ======================== 059 : form check-in + live score + travel ========================

-- Score live public
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS live_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_live_token ON public.events(live_token) WHERE live_token IS NOT NULL;

-- Check-in de forme (avant séance)
ALTER TABLE public.session_rpe ADD COLUMN IF NOT EXISTS form_level INTEGER CHECK (form_level BETWEEN 1 AND 5);
ALTER TABLE public.session_rpe ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
DO $$ BEGIN
  ALTER TABLE public.session_rpe ALTER COLUMN rpe DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- Guide terrain
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS travel_time_min INTEGER CHECK (travel_time_min BETWEEN 0 AND 600);


-- ======================== 088 : journees ========================

ALTER TABLE public.championships ADD COLUMN IF NOT EXISTS journees JSONB;

COMMENT ON COLUMN public.championships.journees IS
  'Liste officielle des journees de la poule DOFA (endpoint poule_journees). Tableau de {number, name, date} tel que colle par le coach. Null tant que non renseigne.';


-- ======================== 101 : match_ratings privacy ========================

-- Helper parent (SECURITY DEFINER)
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

-- SELECT policies : on droppe la brèche team-wide et on pose les policies à grain
DROP POLICY IF EXISTS "Members can view match_ratings" ON public.match_ratings;
DROP POLICY IF EXISTS "Members can manage match_ratings" ON public.match_ratings;
DROP POLICY IF EXISTS "Authenticated can view match_ratings" ON public.match_ratings;
DROP POLICY IF EXISTS "Authenticated can manage match_ratings" ON public.match_ratings;

DROP POLICY IF EXISTS "Coaches can view match_ratings" ON public.match_ratings;
CREATE POLICY "Coaches can view match_ratings"
  ON public.match_ratings FOR SELECT
  USING (public.is_team_coach(team_id));

DROP POLICY IF EXISTS "Player can view own match_ratings" ON public.match_ratings;
CREATE POLICY "Player can view own match_ratings"
  ON public.match_ratings FOR SELECT
  USING (player_id = auth.uid());

DROP POLICY IF EXISTS "Parents can view child match_ratings" ON public.match_ratings;
CREATE POLICY "Parents can view child match_ratings"
  ON public.match_ratings FOR SELECT
  USING (public.is_parent_of_player(auth.uid(), player_id, team_id));


-- ======================== 102 : match_ratings realtime ========================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_ratings;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
