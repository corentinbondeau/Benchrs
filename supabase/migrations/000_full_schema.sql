-- ============================================================
-- SportPlus — Schéma SQL Consolidé Complet
-- Exécuter dans Supabase SQL Editor pour un déploiement frais
-- ============================================================

-- ========================================
-- EXTENSIONS
-- ========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- TYPES ENUM
-- ========================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('coach', 'player', 'parent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM ('match', 'training');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('upcoming', 'ongoing', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'excused', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE match_result AS ENUM ('win', 'loss', 'draw');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE injury_status AS ENUM ('active', 'recovered');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE carpooling_role AS ENUM ('driver', 'passenger');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE licence_status AS ENUM ('valid', 'pending_documents', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('paid', 'pending', 'partial');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ========================================
-- PROFILES (extends Supabase Auth)
-- ========================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  avatar_url TEXT,
  phone TEXT,
  date_of_birth DATE,
  position TEXT,
  shirt_number INT,
  is_active BOOLEAN DEFAULT true,
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  sporteasy_member_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Coaches can update any profile" ON profiles;
CREATE POLICY "Coaches can update any profile"
  ON profiles FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );

DROP POLICY IF EXISTS "Coaches can insert profiles" ON profiles;
CREATE POLICY "Coaches can insert profiles"
  ON profiles FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );

-- ========================================
-- PARENT-STUDENT LINK
-- ========================================
CREATE TABLE IF NOT EXISTS parent_student (
  parent_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_id, student_id)
);

ALTER TABLE parent_student ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parents can view their links" ON parent_student;
CREATE POLICY "Parents can view their links"
  ON parent_student FOR SELECT USING (
    parent_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );

-- ========================================
-- EVENTS
-- ========================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type event_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  location TEXT,
  map_url TEXT,
  status event_status DEFAULT 'upcoming',
  opponent TEXT,
  match_result match_result,
  score_us INT,
  score_them INT,
  sporteasy_id TEXT UNIQUE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view events" ON events;
CREATE POLICY "Anyone can view events" ON events FOR SELECT USING (true);

DROP POLICY IF EXISTS "Coaches can manage events" ON events;
CREATE POLICY "Coaches can manage events" ON events FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

-- ========================================
-- ATTENDANCES
-- ========================================
CREATE TABLE IF NOT EXISTS attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status attendance_status DEFAULT 'pending',
  minutes_played INT DEFAULT 0,
  absence_reason TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view attendances" ON attendances;
CREATE POLICY "Users can view attendances"
  ON attendances FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );

DROP POLICY IF EXISTS "Users can update their own attendance" ON attendances;
CREATE POLICY "Users can update their own attendance"
  ON attendances FOR UPDATE USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );

DROP POLICY IF EXISTS "Coaches can insert attendances" ON attendances;
CREATE POLICY "Coaches can insert attendances"
  ON attendances FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );

DROP POLICY IF EXISTS "Users can insert own attendance" ON attendances;
CREATE POLICY "Users can insert own attendance"
  ON attendances FOR INSERT WITH CHECK (user_id = auth.uid());

-- ========================================
-- MATCH STATS
-- ========================================
CREATE TABLE IF NOT EXISTS match_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  goals INT DEFAULT 0,
  assists INT DEFAULT 0,
  yellow_cards INT DEFAULT 0,
  red_cards INT DEFAULT 0,
  clean_sheet BOOLEAN DEFAULT false,
  saves INT DEFAULT 0,
  minutes_played INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, player_id)
);

ALTER TABLE match_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view match stats" ON match_stats;
CREATE POLICY "Anyone can view match stats" ON match_stats FOR SELECT USING (true);

DROP POLICY IF EXISTS "Coaches can manage match stats" ON match_stats;
CREATE POLICY "Coaches can manage match stats" ON match_stats FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

-- ========================================
-- FITNESS RATINGS
-- ========================================
CREATE TABLE IF NOT EXISTS fitness_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id),
  fatigue_level INT CHECK (fatigue_level BETWEEN 1 AND 5),
  form_level INT CHECK (form_level BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE fitness_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own fitness ratings" ON fitness_ratings;
CREATE POLICY "Users can view own fitness ratings"
  ON fitness_ratings FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );

DROP POLICY IF EXISTS "Users can insert own fitness ratings" ON fitness_ratings;
CREATE POLICY "Users can insert own fitness ratings"
  ON fitness_ratings FOR INSERT WITH CHECK (user_id = auth.uid());

-- ========================================
-- INJURIES
-- ========================================
CREATE TABLE IF NOT EXISTS injuries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  injury_type TEXT,
  injury_date DATE NOT NULL,
  expected_return DATE,
  status injury_status DEFAULT 'active',
  reported_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE injuries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view injuries" ON injuries;
CREATE POLICY "Anyone can view injuries" ON injuries FOR SELECT USING (true);

DROP POLICY IF EXISTS "Coaches can manage injuries" ON injuries;
CREATE POLICY "Coaches can manage injuries" ON injuries FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

DROP POLICY IF EXISTS "Players can report own injuries" ON injuries;
CREATE POLICY "Players can report own injuries"
  ON injuries FOR INSERT WITH CHECK (
    player_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );

-- ========================================
-- TRAINING SESSIONS
-- ========================================
CREATE TABLE IF NOT EXISTS training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  objectives TEXT[],
  exercises JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view training sessions" ON training_sessions;
CREATE POLICY "Anyone can view training sessions" ON training_sessions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Coaches can manage training sessions" ON training_sessions;
CREATE POLICY "Coaches can manage training sessions" ON training_sessions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

-- ========================================
-- FORMATIONS (Tactics board)
-- ========================================
CREATE TABLE IF NOT EXISTS formations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  formation_data JSONB NOT NULL,
  created_by UUID REFERENCES profiles(id),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE formations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view formations" ON formations;
CREATE POLICY "Anyone can view formations" ON formations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Coaches can manage formations" ON formations;
CREATE POLICY "Coaches can manage formations" ON formations FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

-- ========================================
-- MATCH LINEUPS
-- ========================================
CREATE TABLE IF NOT EXISTS match_lineups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  position_label TEXT,
  is_starter BOOLEAN DEFAULT true,
  entered_at_minute INT,
  exited_at_minute INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, player_id)
);

ALTER TABLE match_lineups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view match lineups" ON match_lineups;
CREATE POLICY "Anyone can view match lineups" ON match_lineups FOR SELECT USING (true);

DROP POLICY IF EXISTS "Coaches can manage match lineups" ON match_lineups;
CREATE POLICY "Coaches can manage match lineups" ON match_lineups FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

-- ========================================
-- MATCH EVENTS (Live tracker)
-- ========================================
CREATE TABLE IF NOT EXISTS match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'goal', 'assist', 'yellow_card', 'red_card',
    'substitution_in', 'substitution_out',
    'half_time', 'full_time',
    'penalty_saved', 'penalty_missed'
  )),
  player_id UUID REFERENCES profiles(id),
  related_player_id UUID REFERENCES profiles(id),
  minute INT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view match events" ON match_events;
CREATE POLICY "Anyone can view match events" ON match_events FOR SELECT USING (true);

DROP POLICY IF EXISTS "Coaches can manage match events" ON match_events;
CREATE POLICY "Coaches can manage match events" ON match_events FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

-- ========================================
-- MATCH RATINGS
-- ========================================
CREATE TABLE IF NOT EXISTS match_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rater_id TEXT NOT NULL REFERENCES profiles(id),
  player_id TEXT NOT NULL REFERENCES profiles(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, rater_id, player_id)
);

ALTER TABLE match_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read match_ratings" ON match_ratings;
CREATE POLICY "Authenticated can read match_ratings" ON match_ratings FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Players can rate their own" ON match_ratings;
CREATE POLICY "Players can rate their own" ON match_ratings FOR INSERT WITH CHECK (auth.uid() = rater_id);

DROP POLICY IF EXISTS "Players can update their own ratings" ON match_ratings;
CREATE POLICY "Players can update their own ratings" ON match_ratings FOR UPDATE USING (auth.uid() = rater_id);

-- ========================================
-- CHAT
-- ========================================
CREATE TABLE IF NOT EXISTS chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view public channels" ON chat_channels;
CREATE POLICY "Anyone can view public channels"
  ON chat_channels FOR SELECT USING (is_private = false);

CREATE TABLE IF NOT EXISTS chat_members (
  channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own memberships" ON chat_members;
CREATE POLICY "Users can view own memberships"
  ON chat_members FOR SELECT USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id),
  content TEXT NOT NULL,
  is_edited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view messages in public channels" ON chat_messages;
CREATE POLICY "Users can view messages in public channels"
  ON chat_messages FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_channels
      WHERE chat_channels.id = channel_id AND chat_channels.is_private = false
    )
  );

DROP POLICY IF EXISTS "Users can insert messages" ON chat_messages;
CREATE POLICY "Users can insert messages"
  ON chat_messages FOR INSERT WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "Users can edit own messages" ON chat_messages;
CREATE POLICY "Users can edit own messages"
  ON chat_messages FOR UPDATE USING (sender_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own messages" ON chat_messages;
CREATE POLICY "Users can delete own messages"
  ON chat_messages FOR DELETE USING (sender_id = auth.uid());

DROP POLICY IF EXISTS "Coaches can delete any message" ON chat_messages;
CREATE POLICY "Coaches can delete any message"
  ON chat_messages FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );

-- ========================================
-- CARPOOLING
-- ========================================
CREATE TABLE IF NOT EXISTS carpooling_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES profiles(id),
  total_seats INT NOT NULL,
  departure_location TEXT,
  departure_time TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE carpooling_trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view trips" ON carpooling_trips;
CREATE POLICY "Anyone can view trips" ON carpooling_trips FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create trips" ON carpooling_trips;
CREATE POLICY "Users can create trips"
  ON carpooling_trips FOR INSERT WITH CHECK (driver_id = auth.uid());

CREATE TABLE IF NOT EXISTS carpooling_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES carpooling_trips(id) ON DELETE CASCADE,
  passenger_id UUID REFERENCES profiles(id),
  role carpooling_role DEFAULT 'passenger',
  seats_taken INT DEFAULT 1,
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE carpooling_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view bookings" ON carpooling_bookings;
CREATE POLICY "Anyone can view bookings" ON carpooling_bookings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create bookings" ON carpooling_bookings;
CREATE POLICY "Users can create bookings"
  ON carpooling_bookings FOR INSERT WITH CHECK (passenger_id = auth.uid());

-- ========================================
-- TASKS (Rotation: maillots, goûters)
-- ========================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES profiles(id),
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view tasks" ON tasks;
CREATE POLICY "Anyone can view tasks" ON tasks FOR SELECT USING (true);

DROP POLICY IF EXISTS "Coaches can manage tasks" ON tasks;
CREATE POLICY "Coaches can manage tasks" ON tasks FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

-- ========================================
-- MOTM VOTES
-- ========================================
CREATE TABLE IF NOT EXISTS motm_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  voter_id UUID REFERENCES profiles(id),
  candidate_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, voter_id)
);

ALTER TABLE motm_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view MOTM votes" ON motm_votes;
CREATE POLICY "Users can view MOTM votes" ON motm_votes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own votes" ON motm_votes;
CREATE POLICY "Users can insert own votes"
  ON motm_votes FOR INSERT WITH CHECK (voter_id = auth.uid());

-- ========================================
-- TROPHIES
-- ========================================
CREATE TABLE IF NOT EXISTS trophies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  awarded_to UUID REFERENCES profiles(id),
  awarded_by UUID REFERENCES profiles(id),
  event_id UUID REFERENCES events(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE trophies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view trophies" ON trophies;
CREATE POLICY "Anyone can view trophies" ON trophies FOR SELECT USING (true);

DROP POLICY IF EXISTS "Coaches can manage trophies" ON trophies;
CREATE POLICY "Coaches can manage trophies" ON trophies FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

-- ========================================
-- GALLERY
-- ========================================
CREATE TABLE IF NOT EXISTS gallery_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id),
  uploaded_by UUID REFERENCES profiles(id),
  url TEXT NOT NULL,
  media_type TEXT DEFAULT 'image',
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE gallery_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view gallery" ON gallery_media;
CREATE POLICY "Anyone can view gallery" ON gallery_media FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated can upload to gallery" ON gallery_media;
CREATE POLICY "Authenticated can upload to gallery"
  ON gallery_media FOR INSERT WITH CHECK (auth.uid() = uploaded_by);

-- ========================================
-- NOTIFICATIONS
-- ========================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT,
  reference_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE USING (user_id = auth.uid());

-- ========================================
-- PUSH SUBSCRIPTIONS
-- ========================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own subscriptions" ON push_subscriptions;
CREATE POLICY "Users can manage own subscriptions"
  ON push_subscriptions FOR ALL USING (user_id = auth.uid());

-- ========================================
-- LICENCES & COTISATIONS
-- ========================================
CREATE TABLE IF NOT EXISTS licences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  season TEXT NOT NULL DEFAULT '2025-2026',
  status licence_status DEFAULT 'pending_documents',
  documents_received JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_id, season)
);

ALTER TABLE licences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all licences" ON licences;
CREATE POLICY "Users can view all licences" ON licences FOR SELECT USING (true);

DROP POLICY IF EXISTS "Coaches can manage licences" ON licences;
CREATE POLICY "Coaches can manage licences" ON licences FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

CREATE TABLE IF NOT EXISTS cotisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  season TEXT NOT NULL DEFAULT '2025-2026',
  amount_expected DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
  status payment_status DEFAULT 'pending',
  payment_method TEXT,
  payment_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_id, season)
);

ALTER TABLE cotisations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all cotisations" ON cotisations;
CREATE POLICY "Users can view all cotisations" ON cotisations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Coaches can manage cotisations" ON cotisations;
CREATE POLICY "Coaches can manage cotisations" ON cotisations FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotisation_id UUID REFERENCES cotisations(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT,
  payment_date DATE DEFAULT CURRENT_DATE,
  recorded_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view payment history" ON payment_history;
CREATE POLICY "Users can view payment history" ON payment_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "Coaches can manage payment history" ON payment_history;
CREATE POLICY "Coaches can manage payment history" ON payment_history FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

-- ========================================
-- CHAMPIONSHIPS
-- ========================================
CREATE TABLE IF NOT EXISTS championships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  level TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS championship_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  played INTEGER NOT NULL DEFAULT 0,
  won INTEGER NOT NULL DEFAULT 0,
  drawn INTEGER NOT NULL DEFAULT 0,
  lost INTEGER NOT NULL DEFAULT 0,
  goals_for INTEGER NOT NULL DEFAULT 0,
  goals_against INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(championship_id, team_name)
);

CREATE TABLE IF NOT EXISTS matchdays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  label TEXT,
  played_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(championship_id, number)
);

ALTER TABLE championships ENABLE ROW LEVEL SECURITY;
ALTER TABLE championship_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchdays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read championships" ON championships;
CREATE POLICY "Authenticated can read championships" ON championships FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can read championship_teams" ON championship_teams;
CREATE POLICY "Authenticated can read championship_teams" ON championship_teams FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can read matchdays" ON matchdays;
CREATE POLICY "Authenticated can read matchdays" ON matchdays FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Coachs can manage championships" ON championships;
CREATE POLICY "Coachs can manage championships" ON championships FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

DROP POLICY IF EXISTS "Coachs can manage championship_teams" ON championship_teams;
CREATE POLICY "Coachs can manage championship_teams" ON championship_teams FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

DROP POLICY IF EXISTS "Coachs can manage matchdays" ON matchdays;
CREATE POLICY "Coachs can manage matchdays" ON matchdays FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

-- ========================================
-- SPORTEASY SYNC LOG
-- ========================================
CREATE TABLE IF NOT EXISTS sporteasy_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  records_synced INT DEFAULT 0,
  error_message TEXT,
  synced_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sporteasy_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can view sync logs" ON sporteasy_sync_log;
CREATE POLICY "Coaches can view sync logs"
  ON sporteasy_sync_log FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );

DROP POLICY IF EXISTS "System can insert sync logs" ON sporteasy_sync_log;
CREATE POLICY "System can insert sync logs"
  ON sporteasy_sync_log FOR INSERT WITH CHECK (true);

-- ========================================
-- TEAM SETTINGS
-- ========================================
CREATE TABLE IF NOT EXISTS team_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE team_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view team settings" ON team_settings;
CREATE POLICY "Anyone can view team settings" ON team_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Coaches can manage team settings" ON team_settings;
CREATE POLICY "Coaches can manage team settings" ON team_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
);

-- ========================================
-- INDEXES
-- ========================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_sporteasy ON events(sporteasy_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_attendances_event ON attendances(event_id);
CREATE INDEX IF NOT EXISTS idx_attendances_user ON attendances(user_id);
CREATE INDEX IF NOT EXISTS idx_attendances_status ON attendances(status);
CREATE INDEX IF NOT EXISTS idx_attendances_reason ON attendances(absence_reason);
CREATE INDEX IF NOT EXISTS idx_match_stats_player ON match_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_match_stats_event ON match_stats(event_id);
CREATE INDEX IF NOT EXISTS idx_match_lineups_event ON match_lineups(event_id);
CREATE INDEX IF NOT EXISTS idx_match_events_event ON match_events(event_id);
CREATE INDEX IF NOT EXISTS idx_match_events_type ON match_events(event_type);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_injuries_player ON injuries(player_id);
CREATE INDEX IF NOT EXISTS idx_injuries_status ON injuries(status);
CREATE INDEX IF NOT EXISTS idx_carpooling_trips_event ON carpooling_trips(event_id);
CREATE INDEX IF NOT EXISTS idx_tasks_event ON tasks(event_id);
CREATE INDEX IF NOT EXISTS idx_motm_votes_event ON motm_votes(event_id);
CREATE INDEX IF NOT EXISTS idx_licences_player ON licences(player_id);
CREATE INDEX IF NOT EXISTS idx_licences_season ON licences(season);
CREATE INDEX IF NOT EXISTS idx_cotisations_player ON cotisations(player_id);
CREATE INDEX IF NOT EXISTS idx_cotisations_season ON cotisations(season);
CREATE INDEX IF NOT EXISTS idx_cotisations_status ON cotisations(status);
CREATE INDEX IF NOT EXISTS idx_payment_history_cotisation ON payment_history(cotisation_id);

-- ========================================
-- FUNCTIONS: updated_at trigger
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_training_sessions_updated_at ON training_sessions;
CREATE TRIGGER update_training_sessions_updated_at
  BEFORE UPDATE ON training_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_licences_updated_at ON licences;
CREATE TRIGGER update_licences_updated_at
  BEFORE UPDATE ON licences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cotisations_updated_at ON cotisations;
CREATE TRIGGER update_cotisations_updated_at
  BEFORE UPDATE ON cotisations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_team_settings_updated_at ON team_settings;
CREATE TRIGGER update_team_settings_updated_at
  BEFORE UPDATE ON team_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- FUNCTIONS: Auto-create attendance records
-- ========================================
CREATE OR REPLACE FUNCTION create_attendance_for_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO attendances (event_id, user_id, status)
  SELECT NEW.id, p.id, 'pending'
  FROM profiles p
  WHERE p.role IN ('player', 'parent')
    AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM attendances a
      WHERE a.event_id = NEW.id AND a.user_id = p.id
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_event_created ON events;
CREATE TRIGGER on_event_created
  AFTER INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION create_attendance_for_event();

-- ========================================
-- SEED: Default chat channels
-- ========================================
INSERT INTO chat_channels (name, description, is_private) VALUES
  ('general', 'Canal général de l''équipe', false),
  ('coachs', 'Discussion entre coachs', false),
  ('parents', 'Espace parents', false),
  ('annonces', 'Annonces officielles (lecture seule)', false)
ON CONFLICT DO NOTHING;
