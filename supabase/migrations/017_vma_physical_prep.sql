-- Add VMA (Max Aerobic Speed) field to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vma NUMERIC(5,2);

-- Secure function for coaches to update player VMA (bypasses RLS recursion)
CREATE OR REPLACE FUNCTION update_player_vma(player_id UUID, new_vma NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'coach')
  ) THEN
    UPDATE profiles SET vma = new_vma WHERE id = player_id;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_player_vma TO authenticated;

-- Exercise library for automatic session generation
CREATE TABLE IF NOT EXISTS exercise_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration INTEGER NOT NULL DEFAULT 10,
  category TEXT NOT NULL DEFAULT 'general',
  phase TEXT,
  objectives TEXT[] DEFAULT '{}',
  min_players INTEGER DEFAULT 1,
  max_players INTEGER DEFAULT 99,
  equipment TEXT[] DEFAULT '{}',
  intensity TEXT DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exercise_library_team ON exercise_library(team_id);

ALTER TABLE exercise_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view exercise_library"
  ON exercise_library FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "Coaches can manage exercise_library"
  ON exercise_library FOR ALL
  USING (
    team_id IN (
      SELECT tm.team_id FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')
    )
  );

-- Physical preparation documents (PDF uploads for coaches)
CREATE TABLE IF NOT EXISTS physical_prep_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'application/pdf',
  uploaded_by UUID REFERENCES profiles(id),
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_physical_prep_docs_team ON physical_prep_documents(team_id);

ALTER TABLE physical_prep_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view physical_prep_documents"
  ON physical_prep_documents FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "Coaches can manage physical_prep_documents"
  ON physical_prep_documents FOR ALL
  USING (
    team_id IN (
      SELECT tm.team_id FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')
    )
  );

-- Physical preparation tracking (per-player, per-session status)
CREATE TABLE IF NOT EXISTS physical_prep_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  session_date DATE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_physical_prep_sessions_team ON physical_prep_sessions(team_id);

ALTER TABLE physical_prep_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view physical_prep_sessions"
  ON physical_prep_sessions FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "Coaches can manage physical_prep_sessions"
  ON physical_prep_sessions FOR ALL
  USING (
    team_id IN (
      SELECT tm.team_id FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')
    )
  );

-- Individual player status per prep session
CREATE TABLE IF NOT EXISTS physical_prep_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES physical_prep_sessions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('success', 'partial', 'failed', 'excused', 'pending')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_physical_prep_status_session ON physical_prep_status(session_id);
CREATE INDEX IF NOT EXISTS idx_physical_prep_status_player ON physical_prep_status(player_id);
CREATE INDEX IF NOT EXISTS idx_physical_prep_status_team ON physical_prep_status(team_id);

ALTER TABLE physical_prep_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view physical_prep_status"
  ON physical_prep_status FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "Coaches can manage physical_prep_status"
  ON physical_prep_status FOR ALL
  USING (
    team_id IN (
      SELECT tm.team_id FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'coach')
    )
  );

-- Team join requests
CREATE TABLE IF NOT EXISTS team_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

ALTER TABLE team_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own requests"
  ON team_join_requests FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Coaches can view team requests"
  ON team_join_requests FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid() AND role IN ('owner', 'coach')));

CREATE POLICY "Coaches can manage team requests"
  ON team_join_requests FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid() AND role IN ('owner', 'coach')));
