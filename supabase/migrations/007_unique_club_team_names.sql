-- Ensure unique (club name + team name) combination across all clubs
-- Multiple clubs CAN share the same name, but a team name must be unique per club name

-- Unique combination of club name + team name
CREATE UNIQUE INDEX idx_teams_club_name_team_name_unique
  ON teams ((SELECT c.name FROM clubs c WHERE c.id = club_id), name);
