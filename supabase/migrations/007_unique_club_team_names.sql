-- Ensure unique club names and unique team names within each club

-- Unique club name (only one club with a given name)
ALTER TABLE clubs ADD CONSTRAINT clubs_name_unique UNIQUE (name);

-- Unique team name per club (no duplicate team names in the same club)
ALTER TABLE teams ADD CONSTRAINT teams_club_id_name_unique UNIQUE (club_id, name);
