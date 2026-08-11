-- 067 : Fin de saison & matchday
--        Météo/arbitre/délégué/annulation (events), playlist vestiaire, routine récup,
--        discipline (suspensions), réunions parents + signatures, cagnotte,
--        newsletter, livret récit de saison, vœux, page publique club, essais, sondage séance

-- ============ 1. events : météo + arbitre/délégué + motif d'annulation ============
ALTER TABLE events ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE events ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE events ADD COLUMN IF NOT EXISTS referee TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS delegate TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- ============ 2. Playlist de vestiaire ============
CREATE TABLE IF NOT EXISTS locker_playlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE locker_playlist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view locker playlist" ON locker_playlist_items;
CREATE POLICY "Members view locker playlist"
  ON locker_playlist_items FOR SELECT
  USING (team_id IN (SELECT public.user_visible_team_ids()));
DROP POLICY IF EXISTS "Members add locker playlist" ON locker_playlist_items;
CREATE POLICY "Members add locker playlist"
  ON locker_playlist_items FOR INSERT
  WITH CHECK (team_id IN (SELECT public.user_visible_team_ids()));
DROP POLICY IF EXISTS "Members delete own locker playlist" ON locker_playlist_items;
CREATE POLICY "Members delete own locker playlist"
  ON locker_playlist_items FOR DELETE
  USING (added_by = auth.uid() OR public.is_team_coach(team_id));

-- ============ 3. Routine de récupération (protocole par défaut de l'équipe) ============
ALTER TABLE team_settings ADD COLUMN IF NOT EXISTS recovery_protocol TEXT;

-- ============ 4. Discipline : suspensions ============
CREATE TABLE IF NOT EXISTS suspensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  matches_count INTEGER NOT NULL DEFAULT 1,
  start_date DATE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE suspensions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view suspensions" ON suspensions;
CREATE POLICY "Members view suspensions"
  ON suspensions FOR SELECT
  USING (team_id IN (SELECT public.user_visible_team_ids()));
DROP POLICY IF EXISTS "Coach insert suspensions" ON suspensions;
CREATE POLICY "Coach insert suspensions"
  ON suspensions FOR INSERT
  WITH CHECK (public.is_team_coach(team_id));
DROP POLICY IF EXISTS "Coach update suspensions" ON suspensions;
CREATE POLICY "Coach update suspensions"
  ON suspensions FOR UPDATE
  USING (public.is_team_coach(team_id));
DROP POLICY IF EXISTS "Coach delete suspensions" ON suspensions;
CREATE POLICY "Coach delete suspensions"
  ON suspensions FOR DELETE
  USING (public.is_team_coach(team_id));

-- ============ 5. Réunions parents + signatures ============
CREATE TABLE IF NOT EXISTS parent_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  meeting_date TIMESTAMPTZ,
  location TEXT,
  agenda JSONB NOT NULL DEFAULT '[]',
  minutes JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','cancelled')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE parent_meetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view parent meetings" ON parent_meetings;
CREATE POLICY "Members view parent meetings"
  ON parent_meetings FOR SELECT
  USING (team_id IN (SELECT public.user_visible_team_ids()));
DROP POLICY IF EXISTS "Coach insert parent meetings" ON parent_meetings;
CREATE POLICY "Coach insert parent meetings"
  ON parent_meetings FOR INSERT
  WITH CHECK (public.is_team_coach(team_id));
DROP POLICY IF EXISTS "Coach update parent meetings" ON parent_meetings;
CREATE POLICY "Coach update parent meetings"
  ON parent_meetings FOR UPDATE
  USING (public.is_team_coach(team_id));
DROP POLICY IF EXISTS "Coach delete parent meetings" ON parent_meetings;
CREATE POLICY "Coach delete parent meetings"
  ON parent_meetings FOR DELETE
  USING (public.is_team_coach(team_id));

CREATE TABLE IF NOT EXISTS meeting_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES parent_meetings(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  signature_data TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(meeting_id, member_id)
);
ALTER TABLE meeting_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view meeting signatures" ON meeting_signatures;
CREATE POLICY "Members view meeting signatures"
  ON meeting_signatures FOR SELECT
  USING (team_id IN (SELECT public.user_visible_team_ids()));
DROP POLICY IF EXISTS "Members sign meetings" ON meeting_signatures;
CREATE POLICY "Members sign meetings"
  ON meeting_signatures FOR INSERT
  WITH CHECK (team_id IN (SELECT public.user_visible_team_ids()) AND member_id = auth.uid());
DROP POLICY IF EXISTS "Members delete own signature" ON meeting_signatures;
CREATE POLICY "Members delete own signature"
  ON meeting_signatures FOR DELETE
  USING (member_id = auth.uid());

-- ============ 6. Cagnotte équipe (liée à la trésorerie) ============
CREATE TABLE IF NOT EXISTS team_pots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  goal_amount NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE team_pots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view team pots" ON team_pots;
CREATE POLICY "Members view team pots"
  ON team_pots FOR SELECT
  USING (team_id IN (SELECT public.user_visible_team_ids()));
DROP POLICY IF EXISTS "Coach insert team pots" ON team_pots;
CREATE POLICY "Coach insert team pots"
  ON team_pots FOR INSERT
  WITH CHECK (public.is_team_coach(team_id));
DROP POLICY IF EXISTS "Coach update team pots" ON team_pots;
CREATE POLICY "Coach update team pots"
  ON team_pots FOR UPDATE
  USING (public.is_team_coach(team_id));
DROP POLICY IF EXISTS "Coach delete team pots" ON team_pots;
CREATE POLICY "Coach delete team pots"
  ON team_pots FOR DELETE
  USING (public.is_team_coach(team_id));

CREATE TABLE IF NOT EXISTS pot_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pot_id UUID NOT NULL REFERENCES team_pots(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  contributor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  contributor_name TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  message TEXT,
  payment_method TEXT NOT NULL DEFAULT 'bank' CHECK (payment_method IN ('cash','bank','app')),
  transferred BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE pot_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view pot contributions" ON pot_contributions;
CREATE POLICY "Members view pot contributions"
  ON pot_contributions FOR SELECT
  USING (team_id IN (SELECT public.user_visible_team_ids()));
DROP POLICY IF EXISTS "Members contribute to pot" ON pot_contributions;
CREATE POLICY "Members contribute to pot"
  ON pot_contributions FOR INSERT
  WITH CHECK (team_id IN (SELECT public.user_visible_team_ids()));
DROP POLICY IF EXISTS "Coach manage pot contributions" ON pot_contributions;
CREATE POLICY "Coach manage pot contributions"
  ON pot_contributions FOR UPDATE
  USING (public.is_team_coach(team_id));
DROP POLICY IF EXISTS "Coach delete pot contributions" ON pot_contributions;
CREATE POLICY "Coach delete pot contributions"
  ON pot_contributions FOR DELETE
  USING (public.is_team_coach(team_id));

-- ============ 7. Newsletters mensuelles IA ============
CREATE TABLE IF NOT EXISTS newsletters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, month)
);
ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view newsletters" ON newsletters;
CREATE POLICY "Members view newsletters"
  ON newsletters FOR SELECT
  USING (team_id IN (SELECT public.user_visible_team_ids()));
DROP POLICY IF EXISTS "Coach insert newsletters" ON newsletters;
CREATE POLICY "Coach insert newsletters"
  ON newsletters FOR INSERT
  WITH CHECK (public.is_team_coach(team_id));
DROP POLICY IF EXISTS "Coach update newsletters" ON newsletters;
CREATE POLICY "Coach update newsletters"
  ON newsletters FOR UPDATE
  USING (public.is_team_coach(team_id));

-- ============ 8. Livret récit de saison ============
CREATE TABLE IF NOT EXISTS season_storybooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, season)
);
ALTER TABLE season_storybooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view season storybooks" ON season_storybooks;
CREATE POLICY "Members view season storybooks"
  ON season_storybooks FOR SELECT
  USING (team_id IN (SELECT public.user_visible_team_ids()));
DROP POLICY IF EXISTS "Coach insert season storybooks" ON season_storybooks;
CREATE POLICY "Coach insert season storybooks"
  ON season_storybooks FOR INSERT
  WITH CHECK (public.is_team_coach(team_id));
DROP POLICY IF EXISTS "Coach update season storybooks" ON season_storybooks;
CREATE POLICY "Coach update season storybooks"
  ON season_storybooks FOR UPDATE
  USING (public.is_team_coach(team_id));

-- ============ 9. Vœux de fin de saison IA ============
CREATE TABLE IF NOT EXISTS season_greetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id, team_id, season)
);
ALTER TABLE season_greetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view season greetings" ON season_greetings;
CREATE POLICY "Members view season greetings"
  ON season_greetings FOR SELECT
  USING (team_id IN (SELECT public.user_visible_team_ids()));
DROP POLICY IF EXISTS "Coach insert season greetings" ON season_greetings;
CREATE POLICY "Coach insert season greetings"
  ON season_greetings FOR INSERT
  WITH CHECK (public.is_team_coach(team_id));
DROP POLICY IF EXISTS "Coach update season greetings" ON season_greetings;
CREATE POLICY "Coach update season greetings"
  ON season_greetings FOR UPDATE
  USING (public.is_team_coach(team_id));

-- ============ 10. Clubs : page publique (vitrine) ============
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS public_slug TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS contact_phone TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS clubs_public_slug_uq ON clubs(public_slug) WHERE public_slug IS NOT NULL;

-- ============ 11. Demandes d'essai (publiques) ============
CREATE TABLE IF NOT EXISTS trial_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_first_name TEXT NOT NULL,
  player_last_name TEXT NOT NULL,
  birth_date DATE,
  position TEXT,
  parent_name TEXT,
  parent_email TEXT,
  parent_phone TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','scheduled','accepted','rejected')),
  trial_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE trial_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public submit trial request" ON trial_requests;
CREATE POLICY "Public submit trial request"
  ON trial_requests FOR INSERT
  WITH CHECK (true);
DROP POLICY IF EXISTS "Club view trial requests" ON trial_requests;
CREATE POLICY "Club view trial requests"
  ON trial_requests FOR SELECT
  USING (club_id IN (SELECT public.user_club_ids()));
DROP POLICY IF EXISTS "Club update trial requests" ON trial_requests;
CREATE POLICY "Club update trial requests"
  ON trial_requests FOR UPDATE
  USING (club_id IN (SELECT public.user_club_ids()));
DROP POLICY IF EXISTS "Club delete trial requests" ON trial_requests;
CREATE POLICY "Club delete trial requests"
  ON trial_requests FOR DELETE
  USING (club_id IN (SELECT public.user_club_ids()));

-- ============ 12. Sondage post-entraînement (analyse de séance) ============
CREATE TABLE IF NOT EXISTS session_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 10),
  intensity INTEGER CHECK (intensity >= 1 AND intensity <= 5),
  morale INTEGER CHECK (morale >= 1 AND morale <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, player_id)
);
ALTER TABLE session_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view session feedback" ON session_feedback;
CREATE POLICY "Members view session feedback"
  ON session_feedback FOR SELECT
  USING (team_id IN (SELECT public.user_visible_team_ids()));
DROP POLICY IF EXISTS "Players submit session feedback" ON session_feedback;
CREATE POLICY "Players submit session feedback"
  ON session_feedback FOR INSERT
  WITH CHECK (team_id IN (SELECT public.user_visible_team_ids()) AND player_id = auth.uid());
DROP POLICY IF EXISTS "Players update own session feedback" ON session_feedback;
CREATE POLICY "Players update own session feedback"
  ON session_feedback FOR UPDATE
  USING (player_id = auth.uid());
