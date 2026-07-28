-- Create payment_history table for tracking individual payments

CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotisation_id UUID NOT NULL REFERENCES cotisations(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT,
  payment_date DATE,
  recorded_by UUID REFERENCES profiles(id),
  notes TEXT,
  team_id UUID NOT NULL REFERENCES teams(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_history_cotisation ON payment_history(cotisation_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_team ON payment_history(team_id);

ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view payment_history" ON payment_history;
DROP POLICY IF EXISTS "Members can manage payment_history" ON payment_history;

CREATE POLICY "Members can view payment_history"
  ON payment_history FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "Members can manage payment_history"
  ON payment_history FOR ALL
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
