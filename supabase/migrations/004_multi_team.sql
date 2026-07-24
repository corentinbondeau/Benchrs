-- Multi-team support
-- Creates clubs, teams, team_members tables and adds team_id to all existing tables

-- New enum
DO $$ BEGIN
  CREATE TYPE team_member_role AS ENUM ('owner', 'coach', 'player', 'parent');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Clubs
CREATE TABLE IF NOT EXISTS clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Team members
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role team_member_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Indexes for teams
CREATE INDEX IF NOT EXISTS idx_teams_club ON teams(club_id);
CREATE INDEX IF NOT EXISTS idx_teams_invite_code ON teams(invite_code);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);

-- Enable RLS on new tables
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Add team_id to all existing tables (nullable first — add NOT NULL after migrating data)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE parent_student ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE match_stats ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE fitness_ratings ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE injuries ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE formations ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE match_lineups ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE match_events ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE match_ratings ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE chat_channels ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE carpooling_trips ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE carpooling_bookings ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE motm_votes ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE trophies ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE gallery_media ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE licences ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE cotisations ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE championships ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

-- Indexes on team_id for all tables
CREATE INDEX IF NOT EXISTS idx_events_team ON events(team_id);
CREATE INDEX IF NOT EXISTS idx_attendances_team ON attendances(team_id);
CREATE INDEX IF NOT EXISTS idx_match_stats_team ON match_stats(team_id);
CREATE INDEX IF NOT EXISTS idx_fitness_ratings_team ON fitness_ratings(team_id);
CREATE INDEX IF NOT EXISTS idx_injuries_team ON injuries(team_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_team ON training_sessions(team_id);
CREATE INDEX IF NOT EXISTS idx_formations_team ON formations(team_id);
CREATE INDEX IF NOT EXISTS idx_match_lineups_team ON match_lineups(team_id);
CREATE INDEX IF NOT EXISTS idx_match_events_team ON match_events(team_id);
CREATE INDEX IF NOT EXISTS idx_match_ratings_team ON match_ratings(team_id);
CREATE INDEX IF NOT EXISTS idx_chat_channels_team ON chat_channels(team_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_team ON chat_messages(team_id);
CREATE INDEX IF NOT EXISTS idx_carpooling_trips_team ON carpooling_trips(team_id);
CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_motm_votes_team ON motm_votes(team_id);
CREATE INDEX IF NOT EXISTS idx_trophies_team ON trophies(team_id);
CREATE INDEX IF NOT EXISTS idx_gallery_media_team ON gallery_media(team_id);
CREATE INDEX IF NOT EXISTS idx_notifications_team ON notifications(team_id);
CREATE INDEX IF NOT EXISTS idx_licence_team ON licences(team_id);
CREATE INDEX IF NOT EXISTS idx_cotisations_team ON cotisations(team_id);
CREATE INDEX IF NOT EXISTS idx_championships_team ON championships(team_id);
