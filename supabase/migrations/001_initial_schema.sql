-- SportPlus Database Migration
-- Run this in Supabase SQL Editor or via supabase db push

-- ========================================
-- ENUMS
-- ========================================
CREATE TYPE user_role AS ENUM ('coach', 'player', 'parent');
CREATE TYPE event_type AS ENUM ('match', 'training');
CREATE TYPE event_status AS ENUM ('upcoming', 'ongoing', 'completed', 'cancelled');
CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'excused', 'pending');
CREATE TYPE match_result AS ENUM ('win', 'loss', 'draw');
CREATE TYPE injury_status AS ENUM ('active', 'recovered');
CREATE TYPE carpooling_role AS ENUM ('driver', 'passenger');

-- ========================================
-- PROFILES (extends Supabase Auth)
-- ========================================
CREATE TABLE profiles (
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
  sporteasy_member_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Coaches can update any profile"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- ========================================
-- PARENT-STUDENT LINK
-- ========================================
CREATE TABLE parent_student (
  parent_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_id, student_id)
);

ALTER TABLE parent_student ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can view their links"
  ON parent_student FOR SELECT
  USING (
    parent_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- ========================================
-- EVENTS
-- ========================================
CREATE TABLE events (
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

CREATE POLICY "Anyone can view events"
  ON events FOR SELECT
  USING (true);

CREATE POLICY "Coaches can manage events"
  ON events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- ========================================
-- ATTENDANCES
-- ========================================
CREATE TABLE attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status attendance_status DEFAULT 'pending',
  minutes_played INT DEFAULT 0,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attendances for their events"
  ON attendances FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

CREATE POLICY "Users can update their own attendance"
  ON attendances FOR UPDATE
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

CREATE POLICY "Coaches can insert attendances"
  ON attendances FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- ========================================
-- MATCH STATS
-- ========================================
CREATE TABLE match_stats (
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

CREATE POLICY "Anyone can view match stats"
  ON match_stats FOR SELECT
  USING (true);

CREATE POLICY "Coaches can manage match stats"
  ON match_stats FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- ========================================
-- FITNESS RATINGS
-- ========================================
CREATE TABLE fitness_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id),
  fatigue_level INT CHECK (fatigue_level BETWEEN 1 AND 5),
  form_level INT CHECK (form_level BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE fitness_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fitness ratings"
  ON fitness_ratings FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

CREATE POLICY "Users can insert own fitness ratings"
  ON fitness_ratings FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ========================================
-- INJURIES
-- ========================================
CREATE TABLE injuries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  injury_date DATE NOT NULL,
  expected_return DATE,
  status injury_status DEFAULT 'active',
  reported_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE injuries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view injuries"
  ON injuries FOR SELECT
  USING (true);

CREATE POLICY "Coaches can manage injuries"
  ON injuries FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- ========================================
-- TRAINING SESSIONS
-- ========================================
CREATE TABLE training_sessions (
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

CREATE POLICY "Anyone can view training sessions"
  ON training_sessions FOR SELECT
  USING (true);

CREATE POLICY "Coaches can manage training sessions"
  ON training_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- ========================================
-- FORMATIONS
-- ========================================
CREATE TABLE formations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  formation_data JSONB NOT NULL,
  created_by UUID REFERENCES profiles(id),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE formations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view formations"
  ON formations FOR SELECT
  USING (true);

CREATE POLICY "Coaches can manage formations"
  ON formations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- ========================================
-- CHAT
-- ========================================
CREATE TABLE chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view public channels"
  ON chat_channels FOR SELECT
  USING (is_private = false);

CREATE TABLE chat_members (
  channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own memberships"
  ON chat_members FOR SELECT
  USING (user_id = auth.uid());

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id),
  content TEXT NOT NULL,
  is_edited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in public channels"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_channels
      WHERE chat_channels.id = channel_id AND chat_channels.is_private = false
    )
  );

CREATE POLICY "Users can insert messages"
  ON chat_messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- ========================================
-- CARPOOLING
-- ========================================
CREATE TABLE carpooling_trips (
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

CREATE POLICY "Anyone can view trips"
  ON carpooling_trips FOR SELECT
  USING (true);

CREATE POLICY "Users can create trips"
  ON carpooling_trips FOR INSERT
  WITH CHECK (driver_id = auth.uid());

CREATE TABLE carpooling_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES carpooling_trips(id) ON DELETE CASCADE,
  passenger_id UUID REFERENCES profiles(id),
  role carpooling_role DEFAULT 'passenger',
  seats_taken INT DEFAULT 1,
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE carpooling_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view bookings"
  ON carpooling_bookings FOR SELECT
  USING (true);

CREATE POLICY "Users can create bookings"
  ON carpooling_bookings FOR INSERT
  WITH CHECK (passenger_id = auth.uid());

-- ========================================
-- TASKS (Rotation: maillots, goûters)
-- ========================================
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES profiles(id),
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tasks"
  ON tasks FOR SELECT
  USING (true);

CREATE POLICY "Coaches can manage tasks"
  ON tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- ========================================
-- MOTM VOTES
-- ========================================
CREATE TABLE motm_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  voter_id UUID REFERENCES profiles(id),
  candidate_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, voter_id)
);

ALTER TABLE motm_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view MOTM votes"
  ON motm_votes FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own votes"
  ON motm_votes FOR INSERT
  WITH CHECK (voter_id = auth.uid());

-- ========================================
-- TROPHIES
-- ========================================
CREATE TABLE trophies (
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

CREATE POLICY "Anyone can view trophies"
  ON trophies FOR SELECT
  USING (true);

CREATE POLICY "Coaches can manage trophies"
  ON trophies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- ========================================
-- GALLERY
-- ========================================
CREATE TABLE gallery_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id),
  uploaded_by UUID REFERENCES profiles(id),
  url TEXT NOT NULL,
  media_type TEXT DEFAULT 'image',
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE gallery_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view gallery"
  ON gallery_media FOR SELECT
  USING (true);

-- ========================================
-- NOTIFICATIONS
-- ========================================
CREATE TABLE notifications (
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

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

-- ========================================
-- PUSH SUBSCRIPTIONS
-- ========================================
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own subscriptions"
  ON push_subscriptions FOR ALL
  USING (user_id = auth.uid());

-- ========================================
-- SPORTEASY SYNC LOG
-- ========================================
CREATE TABLE sporteasy_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  records_synced INT DEFAULT 0,
  error_message TEXT,
  synced_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sporteasy_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view sync logs"
  ON sporteasy_sync_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

CREATE POLICY "System can insert sync logs"
  ON sporteasy_sync_log FOR INSERT
  WITH CHECK (true);

-- ========================================
-- TEAM SETTINGS
-- ========================================
CREATE TABLE team_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE team_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view team settings"
  ON team_settings FOR SELECT
  USING (true);

CREATE POLICY "Coaches can manage team settings"
  ON team_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- ========================================
-- INDEXES
-- ========================================
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_sporteasy ON events(sporteasy_id);
CREATE INDEX idx_attendances_event ON attendances(event_id);
CREATE INDEX idx_attendances_user ON attendances(user_id);
CREATE INDEX idx_attendances_status ON attendances(status);
CREATE INDEX idx_match_stats_player ON match_stats(player_id);
CREATE INDEX idx_match_stats_event ON match_stats(event_id);
CREATE INDEX idx_chat_messages_channel ON chat_messages(channel_id, created_at);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_injuries_player ON injuries(player_id);
CREATE INDEX idx_injuries_status ON injuries(status);
CREATE INDEX idx_carpooling_trips_event ON carpooling_trips(event_id);
CREATE INDEX idx_tasks_event ON tasks(event_id);
CREATE INDEX idx_motm_votes_event ON motm_votes(event_id);

-- ========================================
-- SEED DEFAULT CHAT CHANNELS
-- ========================================
INSERT INTO chat_channels (name, description, is_private) VALUES
  ('general', 'Canal général de l''équipe', false),
  ('coachs', 'Discussion entre coachs', false),
  ('parents', 'Espace parents', false);
