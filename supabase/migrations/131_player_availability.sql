CREATE TABLE IF NOT EXISTS player_availability (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT player_availability_dates_check CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_player_availability_team ON player_availability(team_id);
CREATE INDEX IF NOT EXISTS idx_player_availability_player ON player_availability(player_id);
CREATE INDEX IF NOT EXISTS idx_player_availability_dates ON player_availability(start_date, end_date);

ALTER TABLE player_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view team availability" ON player_availability;
CREATE POLICY "Members can view team availability" ON player_availability FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = player_availability.team_id AND tm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM parent_student ps
      WHERE ps.student_id = player_availability.player_id AND ps.parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Player or parent can manage own availability" ON player_availability;
CREATE POLICY "Player or parent can manage own availability" ON player_availability FOR ALL
  USING (
    auth.uid() = player_id
    OR EXISTS (
      SELECT 1 FROM parent_student ps
      WHERE ps.student_id = player_availability.player_id AND ps.parent_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = player_id
    OR EXISTS (
      SELECT 1 FROM parent_student ps
      WHERE ps.student_id = player_availability.player_id AND ps.parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Coaches can manage team availability" ON player_availability;
CREATE POLICY "Coaches can manage team availability" ON player_availability FOR ALL
  USING (public.is_team_coach(team_id))
  WITH CHECK (public.is_team_coach(team_id));
