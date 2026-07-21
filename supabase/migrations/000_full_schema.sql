-- SportPlus Database Schema
-- Enable RLS on all tables

-- ENUM types
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('coach', 'player', 'parent');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM ('match', 'training');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('upcoming', 'ongoing', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'excused', 'pending');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE match_result AS ENUM ('win', 'loss', 'draw');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE injury_status AS ENUM ('active', 'recovered');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE carpooling_role AS ENUM ('driver', 'passenger');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Tables
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'player',
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  avatar_url TEXT,
  phone TEXT,
  date_of_birth DATE,
  position TEXT,
  shirt_number INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  email_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parent_student (
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_id, student_id)
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type event_type NOT NULL DEFAULT 'training',
  title TEXT NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  location TEXT,
  map_url TEXT,
  status event_status NOT NULL DEFAULT 'upcoming',
  opponent TEXT,
  match_result match_result,
  score_us INTEGER,
  score_them INTEGER,
  sporteasy_id TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status attendance_status NOT NULL DEFAULT 'pending',
  minutes_played INTEGER DEFAULT 0,
  absence_reason TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  yellow_cards INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  clean_sheet BOOLEAN DEFAULT false,
  saves INTEGER DEFAULT 0,
  minutes_played INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fitness_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id),
  fatigue_level INTEGER DEFAULT 5,
  form_level INTEGER DEFAULT 5,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS injuries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  injury_type TEXT,
  injury_date DATE NOT NULL,
  expected_return DATE,
  status injury_status NOT NULL DEFAULT 'active',
  reported_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  objectives TEXT[],
  exercises JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS formations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  formation_data JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES profiles(id),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_lineups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  position_label TEXT,
  is_starter BOOLEAN DEFAULT true,
  entered_at_minute INTEGER,
  exited_at_minute INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  player_id UUID REFERENCES profiles(id),
  related_player_id UUID REFERENCES profiles(id),
  minute INTEGER,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, rater_id, player_id)
);

CREATE TABLE IF NOT EXISTS chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_members (
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  is_edited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carpooling_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  total_seats INTEGER NOT NULL DEFAULT 4,
  departure_location TEXT,
  departure_time TIME,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carpooling_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES carpooling_trips(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role carpooling_role NOT NULL DEFAULT 'passenger',
  seats_taken INTEGER DEFAULT 1,
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES profiles(id),
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS motm_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  voter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trophies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  awarded_to UUID REFERENCES profiles(id),
  awarded_by UUID REFERENCES profiles(id),
  event_id UUID REFERENCES events(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gallery_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id),
  uploaded_by UUID REFERENCES profiles(id),
  url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT,
  reference_id TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS licences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  status TEXT DEFAULT 'pending_documents',
  documents_received TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cotisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  amount_expected NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  payment_method TEXT,
  payment_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS championships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS championship_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  matchday_number INTEGER,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INTEGER DEFAULT 0,
  away_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_student ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitness_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE injuries ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE formations ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE carpooling_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE carpooling_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE motm_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE trophies ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE licences ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE championships ENABLE ROW LEVEL SECURITY;
ALTER TABLE championship_standings ENABLE ROW LEVEL SECURITY;

-- Permissive read policies (all authenticated users can read)
CREATE POLICY "Authenticated can view profiles" ON profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Service role can insert profiles" ON profiles FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated can view parent_student" ON parent_student FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage parent_student" ON parent_student FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view events" ON events FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage events" ON events FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view attendances" ON attendances FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage attendances" ON attendances FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view match_stats" ON match_stats FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage match_stats" ON match_stats FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view fitness_ratings" ON fitness_ratings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage fitness_ratings" ON fitness_ratings FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view injuries" ON injuries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage injuries" ON injuries FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view training_sessions" ON training_sessions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage training_sessions" ON training_sessions FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view formations" ON formations FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage formations" ON formations FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view match_lineups" ON match_lineups FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage match_lineups" ON match_lineups FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view match_events" ON match_events FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage match_events" ON match_events FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view match_ratings" ON match_ratings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage match_ratings" ON match_ratings FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view chat_channels" ON chat_channels FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage chat_channels" ON chat_channels FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view chat_members" ON chat_members FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage chat_members" ON chat_members FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view chat_messages" ON chat_messages FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage chat_messages" ON chat_messages FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view carpooling_trips" ON carpooling_trips FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage carpooling_trips" ON carpooling_trips FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view carpooling_bookings" ON carpooling_bookings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage carpooling_bookings" ON carpooling_bookings FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view tasks" ON tasks FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage tasks" ON tasks FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view motm_votes" ON motm_votes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage motm_votes" ON motm_votes FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view trophies" ON trophies FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage trophies" ON trophies FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view gallery_media" ON gallery_media FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage gallery_media" ON gallery_media FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view notifications" ON notifications FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage notifications" ON notifications FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view push_subscriptions" ON push_subscriptions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage push_subscriptions" ON push_subscriptions FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view licences" ON licences FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage licences" ON licences FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view cotisations" ON cotisations FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage cotisations" ON cotisations FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view championships" ON championships FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage championships" ON championships FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can view championship_standings" ON championship_standings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage championship_standings" ON championship_standings FOR ALL USING (auth.role() = 'authenticated');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_attendances_event_id ON attendances(event_id);
CREATE INDEX IF NOT EXISTS idx_attendances_user_id ON attendances(user_id);
CREATE INDEX IF NOT EXISTS idx_match_stats_player_id ON match_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_match_stats_event_id ON match_stats(event_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_id ON chat_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_carpooling_trips_event_id ON carpooling_trips(event_id);
CREATE INDEX IF NOT EXISTS idx_tasks_event_id ON tasks(event_id);

-- Seed data: default chat channel
INSERT INTO chat_channels (name, description) VALUES
  ('General', 'Canal general de l''equipe')
ON CONFLICT DO NOTHING;
