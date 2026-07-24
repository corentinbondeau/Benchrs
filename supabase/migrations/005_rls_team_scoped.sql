-- RLS policies scoped by team_id
-- Fully idempotent: safe to re-run

-- ============================================================
-- CLUBS
-- ============================================================
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view clubs" ON clubs;
DROP POLICY IF EXISTS "Authenticated can manage clubs" ON clubs;
DROP POLICY IF EXISTS "Members can view their club" ON clubs;
DROP POLICY IF EXISTS "Authenticated can create clubs" ON clubs;
DROP POLICY IF EXISTS "Club owners can update their club" ON clubs;

CREATE POLICY "Members can view their club"
  ON clubs FOR SELECT
  USING (
    id IN (
      SELECT t.club_id FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
    )
  );
CREATE POLICY "Authenticated can create clubs"
  ON clubs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Club owners can update their club"
  ON clubs FOR UPDATE
  USING (created_by = auth.uid());

-- ============================================================
-- TEAMS
-- ============================================================
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view teams" ON teams;
DROP POLICY IF EXISTS "Authenticated can manage teams" ON teams;
DROP POLICY IF EXISTS "Members can view their teams" ON teams;
DROP POLICY IF EXISTS "Authenticated can create teams" ON teams;
DROP POLICY IF EXISTS "Team owners can update their team" ON teams;
DROP POLICY IF EXISTS "Team owners can delete their team" ON teams;

CREATE POLICY "Members can view their teams"
  ON teams FOR SELECT
  USING (id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Authenticated can create teams"
  ON teams FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Team owners can update their team"
  ON teams FOR UPDATE
  USING (id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid() AND role = 'owner'));
CREATE POLICY "Team owners can delete their team"
  ON teams FOR DELETE
  USING (id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid() AND role = 'owner'));

-- ============================================================
-- TEAM_MEMBERS
-- ============================================================
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view team_members" ON team_members;
DROP POLICY IF EXISTS "Authenticated can manage team_members" ON team_members;
DROP POLICY IF EXISTS "Members can view their team membership" ON team_members;
DROP POLICY IF EXISTS "Authenticated can join teams" ON team_members;
DROP POLICY IF EXISTS "Team owners can manage membership" ON team_members;

CREATE POLICY "Members can view their team membership"
  ON team_members FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Authenticated can join teams"
  ON team_members FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Team owners can manage membership"
  ON team_members FOR DELETE
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid() AND role = 'owner'));

-- ============================================================
-- PROFILES
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view profiles" ON profiles;
DROP POLICY IF EXISTS "Authenticated can update own profile" ON profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Members can view team profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;

CREATE POLICY "Members can view team profiles"
  ON profiles FOR SELECT
  USING (
    auth.uid() = id
    OR team_id IS NULL
    OR team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);
CREATE POLICY "Service role can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- PARENT_STUDENT
-- ============================================================
ALTER TABLE parent_student ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view parent_student" ON parent_student;
DROP POLICY IF EXISTS "Authenticated can manage parent_student" ON parent_student;
DROP POLICY IF EXISTS "Members can view parent_student" ON parent_student;
DROP POLICY IF EXISTS "Members can manage parent_student" ON parent_student;

CREATE POLICY "Members can view parent_student"
  ON parent_student FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage parent_student"
  ON parent_student FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- EVENTS
-- ============================================================
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view events" ON events;
DROP POLICY IF EXISTS "Authenticated can manage events" ON events;
DROP POLICY IF EXISTS "Members can view events" ON events;
DROP POLICY IF EXISTS "Members can manage events" ON events;

CREATE POLICY "Members can view events"
  ON events FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage events"
  ON events FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- ATTENDANCES
-- ============================================================
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view attendances" ON attendances;
DROP POLICY IF EXISTS "Authenticated can manage attendances" ON attendances;
DROP POLICY IF EXISTS "Members can view attendances" ON attendances;
DROP POLICY IF EXISTS "Members can manage attendances" ON attendances;

CREATE POLICY "Members can view attendances"
  ON attendances FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage attendances"
  ON attendances FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- MATCH_STATS
-- ============================================================
ALTER TABLE match_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view match_stats" ON match_stats;
DROP POLICY IF EXISTS "Authenticated can manage match_stats" ON match_stats;
DROP POLICY IF EXISTS "Members can view match_stats" ON match_stats;
DROP POLICY IF EXISTS "Members can manage match_stats" ON match_stats;

CREATE POLICY "Members can view match_stats"
  ON match_stats FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage match_stats"
  ON match_stats FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- FITNESS_RATINGS
-- ============================================================
ALTER TABLE fitness_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view fitness_ratings" ON fitness_ratings;
DROP POLICY IF EXISTS "Authenticated can manage fitness_ratings" ON fitness_ratings;
DROP POLICY IF EXISTS "Members can view fitness_ratings" ON fitness_ratings;
DROP POLICY IF EXISTS "Members can manage fitness_ratings" ON fitness_ratings;

CREATE POLICY "Members can view fitness_ratings"
  ON fitness_ratings FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage fitness_ratings"
  ON fitness_ratings FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- INJURIES
-- ============================================================
ALTER TABLE injuries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view injuries" ON injuries;
DROP POLICY IF EXISTS "Authenticated can manage injuries" ON injuries;
DROP POLICY IF EXISTS "Members can view injuries" ON injuries;
DROP POLICY IF EXISTS "Members can manage injuries" ON injuries;

CREATE POLICY "Members can view injuries"
  ON injuries FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage injuries"
  ON injuries FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- TRAINING_SESSIONS
-- ============================================================
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view training_sessions" ON training_sessions;
DROP POLICY IF EXISTS "Authenticated can manage training_sessions" ON training_sessions;
DROP POLICY IF EXISTS "Members can view training_sessions" ON training_sessions;
DROP POLICY IF EXISTS "Members can manage training_sessions" ON training_sessions;

CREATE POLICY "Members can view training_sessions"
  ON training_sessions FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage training_sessions"
  ON training_sessions FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- FORMATIONS
-- ============================================================
ALTER TABLE formations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view formations" ON formations;
DROP POLICY IF EXISTS "Authenticated can manage formations" ON formations;
DROP POLICY IF EXISTS "Members can view formations" ON formations;
DROP POLICY IF EXISTS "Members can manage formations" ON formations;

CREATE POLICY "Members can view formations"
  ON formations FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage formations"
  ON formations FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- MATCH_LINEUPS
-- ============================================================
ALTER TABLE match_lineups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view match_lineups" ON match_lineups;
DROP POLICY IF EXISTS "Authenticated can manage match_lineups" ON match_lineups;
DROP POLICY IF EXISTS "Members can view match_lineups" ON match_lineups;
DROP POLICY IF EXISTS "Members can manage match_lineups" ON match_lineups;

CREATE POLICY "Members can view match_lineups"
  ON match_lineups FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage match_lineups"
  ON match_lineups FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- MATCH_EVENTS
-- ============================================================
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view match_events" ON match_events;
DROP POLICY IF EXISTS "Authenticated can manage match_events" ON match_events;
DROP POLICY IF EXISTS "Members can view match_events" ON match_events;
DROP POLICY IF EXISTS "Members can manage match_events" ON match_events;

CREATE POLICY "Members can view match_events"
  ON match_events FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage match_events"
  ON match_events FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- MATCH_RATINGS
-- ============================================================
ALTER TABLE match_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view match_ratings" ON match_ratings;
DROP POLICY IF EXISTS "Authenticated can manage match_ratings" ON match_ratings;
DROP POLICY IF EXISTS "Members can view match_ratings" ON match_ratings;
DROP POLICY IF EXISTS "Members can manage match_ratings" ON match_ratings;

CREATE POLICY "Members can view match_ratings"
  ON match_ratings FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage match_ratings"
  ON match_ratings FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- CHAT_CHANNELS
-- ============================================================
ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view chat_channels" ON chat_channels;
DROP POLICY IF EXISTS "Authenticated can manage chat_channels" ON chat_channels;
DROP POLICY IF EXISTS "Members can view chat_channels" ON chat_channels;
DROP POLICY IF EXISTS "Members can manage chat_channels" ON chat_channels;

CREATE POLICY "Members can view chat_channels"
  ON chat_channels FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage chat_channels"
  ON chat_channels FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- CHAT_MEMBERS
-- ============================================================
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view chat_members" ON chat_members;
DROP POLICY IF EXISTS "Authenticated can manage chat_members" ON chat_members;
DROP POLICY IF EXISTS "Members can view chat_members" ON chat_members;
DROP POLICY IF EXISTS "Members can manage chat_members" ON chat_members;

CREATE POLICY "Members can view chat_members"
  ON chat_members FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage chat_members"
  ON chat_members FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- CHAT_MESSAGES
-- ============================================================
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Authenticated can manage chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Members can view chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Members can manage chat_messages" ON chat_messages;

CREATE POLICY "Members can view chat_messages"
  ON chat_messages FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage chat_messages"
  ON chat_messages FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- CARPOOLING_TRIPS
-- ============================================================
ALTER TABLE carpooling_trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view carpooling_trips" ON carpooling_trips;
DROP POLICY IF EXISTS "Authenticated can manage carpooling_trips" ON carpooling_trips;
DROP POLICY IF EXISTS "Members can view carpooling_trips" ON carpooling_trips;
DROP POLICY IF EXISTS "Members can manage carpooling_trips" ON carpooling_trips;

CREATE POLICY "Members can view carpooling_trips"
  ON carpooling_trips FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage carpooling_trips"
  ON carpooling_trips FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- CARPOOLING_BOOKINGS
-- ============================================================
ALTER TABLE carpooling_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view carpooling_bookings" ON carpooling_bookings;
DROP POLICY IF EXISTS "Authenticated can manage carpooling_bookings" ON carpooling_bookings;
DROP POLICY IF EXISTS "Members can view carpooling_bookings" ON carpooling_bookings;
DROP POLICY IF EXISTS "Members can manage carpooling_bookings" ON carpooling_bookings;

CREATE POLICY "Members can view carpooling_bookings"
  ON carpooling_bookings FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage carpooling_bookings"
  ON carpooling_bookings FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- TASKS
-- ============================================================
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view tasks" ON tasks;
DROP POLICY IF EXISTS "Authenticated can manage tasks" ON tasks;
DROP POLICY IF EXISTS "Members can view tasks" ON tasks;
DROP POLICY IF EXISTS "Members can manage tasks" ON tasks;

CREATE POLICY "Members can view tasks"
  ON tasks FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage tasks"
  ON tasks FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- MOTM_VOTES
-- ============================================================
ALTER TABLE motm_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view motm_votes" ON motm_votes;
DROP POLICY IF EXISTS "Authenticated can manage motm_votes" ON motm_votes;
DROP POLICY IF EXISTS "Members can view motm_votes" ON motm_votes;
DROP POLICY IF EXISTS "Members can manage motm_votes" ON motm_votes;

CREATE POLICY "Members can view motm_votes"
  ON motm_votes FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage motm_votes"
  ON motm_votes FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- TROPHIES
-- ============================================================
ALTER TABLE trophies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view trophies" ON trophies;
DROP POLICY IF EXISTS "Authenticated can manage trophies" ON trophies;
DROP POLICY IF EXISTS "Members can view trophies" ON trophies;
DROP POLICY IF EXISTS "Members can manage trophies" ON trophies;

CREATE POLICY "Members can view trophies"
  ON trophies FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage trophies"
  ON trophies FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- GALLERY_MEDIA
-- ============================================================
ALTER TABLE gallery_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view gallery_media" ON gallery_media;
DROP POLICY IF EXISTS "Authenticated can manage gallery_media" ON gallery_media;
DROP POLICY IF EXISTS "Members can view gallery_media" ON gallery_media;
DROP POLICY IF EXISTS "Members can manage gallery_media" ON gallery_media;

CREATE POLICY "Members can view gallery_media"
  ON gallery_media FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage gallery_media"
  ON gallery_media FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- NOTIFICATIONS (user-scoped)
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view notifications" ON notifications;
DROP POLICY IF EXISTS "Authenticated can manage notifications" ON notifications;
DROP POLICY IF EXISTS "Users can view their notifications" ON notifications;
DROP POLICY IF EXISTS "Users can manage their notifications" ON notifications;

CREATE POLICY "Users can view their notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their notifications"
  ON notifications FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- PUSH_SUBSCRIPTIONS (user-scoped)
-- ============================================================
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view push_subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Authenticated can manage push_subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Users can manage their push_subscriptions" ON push_subscriptions;

CREATE POLICY "Users can manage their push_subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- LICENCES
-- ============================================================
ALTER TABLE licences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view licences" ON licences;
DROP POLICY IF EXISTS "Authenticated can manage licences" ON licences;
DROP POLICY IF EXISTS "Members can view licences" ON licences;
DROP POLICY IF EXISTS "Members can manage licences" ON licences;

CREATE POLICY "Members can view licences"
  ON licences FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage licences"
  ON licences FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- COTISATIONS
-- ============================================================
ALTER TABLE cotisations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view cotisations" ON cotisations;
DROP POLICY IF EXISTS "Authenticated can manage cotisations" ON cotisations;
DROP POLICY IF EXISTS "Members can view cotisations" ON cotisations;
DROP POLICY IF EXISTS "Members can manage cotisations" ON cotisations;

CREATE POLICY "Members can view cotisations"
  ON cotisations FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage cotisations"
  ON cotisations FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ============================================================
-- CHAMPIONSHIPS
-- ============================================================
ALTER TABLE championships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view championships" ON championships;
DROP POLICY IF EXISTS "Authenticated can manage championships" ON championships;
DROP POLICY IF EXISTS "Members can view championships" ON championships;
DROP POLICY IF EXISTS "Members can manage championships" ON championships;

CREATE POLICY "Members can view championships"
  ON championships FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage championships"
  ON championships FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
