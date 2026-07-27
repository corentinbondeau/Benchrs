-- Ensure unique (club name + team name) combination across all clubs
-- Multiple clubs CAN share the same name, but a team name must be unique per club name

-- Add club_name column to teams (denormalized for unique constraint)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS club_name TEXT;

-- Backfill existing teams
UPDATE teams t SET club_name = c.name FROM clubs c WHERE t.club_id = c.id AND t.club_name IS NULL;

-- Make club_name NOT NULL after backfill
ALTER TABLE teams ALTER COLUMN club_name SET NOT NULL;

-- Unique combination of club name + team name
CREATE UNIQUE INDEX idx_teams_club_name_team_name_unique
  ON teams (club_name, name);

-- Trigger to keep club_name in sync on insert/update
CREATE OR REPLACE FUNCTION sync_team_club_name()
RETURNS TRIGGER AS $$
BEGIN
  SELECT c.name INTO NEW.club_name FROM clubs c WHERE c.id = NEW.club_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_team_club_name
  BEFORE INSERT OR UPDATE OF club_id ON teams
  FOR EACH ROW
  EXECUTE FUNCTION sync_team_club_name();
