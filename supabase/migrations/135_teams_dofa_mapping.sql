-- Migration 135: Add DOFA mapping to teams table
-- Allows teams to store their DOFA affiliation (cl_no, team_number) for auto-importing matches

ALTER TABLE teams ADD COLUMN IF NOT EXISTS dofa_cl_no INTEGER;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS dofa_team_number INTEGER;

-- Index for fast lookup by DOFA identity
CREATE INDEX IF NOT EXISTS idx_teams_dofa_identity ON teams(dofa_cl_no, dofa_team_number);

-- Comment for documentation
COMMENT ON COLUMN teams.dofa_cl_no IS 'FFF club number (cl_no) from DOFA';
COMMENT ON COLUMN teams.dofa_team_number IS 'FFF team number within the club from DOFA';
