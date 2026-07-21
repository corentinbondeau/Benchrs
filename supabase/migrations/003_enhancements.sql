-- SportPlus Enhancement Migration 003

-- Add absence reason to attendances
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS absence_reason TEXT;

-- Add injury type to injuries  
ALTER TABLE injuries ADD COLUMN IF NOT EXISTS injury_type TEXT;

-- Match lineups (who's on field/bench for live tracking)
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

CREATE POLICY "Anyone can view match lineups"
  ON match_lineups FOR SELECT
  USING (true);

CREATE POLICY "Coaches can manage match lineups"
  ON match_lineups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- Match events (real-time tracking: goals, cards, subs)
CREATE TABLE IF NOT EXISTS match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('goal', 'assist', 'yellow_card', 'red_card', 'substitution_in', 'substitution_out', 'half_time', 'full_time', 'penalty_saved', 'penalty_missed')),
  player_id UUID REFERENCES profiles(id),
  related_player_id UUID REFERENCES profiles(id),
  minute INT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view match events"
  ON match_events FOR SELECT
  USING (true);

CREATE POLICY "Coaches can manage match events"
  ON match_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_match_lineups_event ON match_lineups(event_id);
CREATE INDEX IF NOT EXISTS idx_match_events_event ON match_events(event_id);
CREATE INDEX IF NOT EXISTS idx_match_events_type ON match_events(event_type);
CREATE INDEX IF NOT EXISTS idx_attendances_reason ON attendances(absence_reason);
