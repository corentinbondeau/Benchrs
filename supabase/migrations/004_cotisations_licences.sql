-- SportPlus Enhancement Migration 004: Cotisations & Licences

-- Licence status enum
CREATE TYPE licence_status AS ENUM ('valid', 'pending_documents', 'expired');

-- Payment status enum
CREATE TYPE payment_status AS ENUM ('paid', 'pending', 'partial');

-- Licences table
CREATE TABLE IF NOT EXISTS licences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  season TEXT NOT NULL DEFAULT '2025-2026',
  status licence_status DEFAULT 'pending_documents',
  documents_received JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_id, season)
);

ALTER TABLE licences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all licences"
  ON licences FOR SELECT
  USING (true);

CREATE POLICY "Coaches can manage licences"
  ON licences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- Cotisations (payments) table
CREATE TABLE IF NOT EXISTS cotisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  season TEXT NOT NULL DEFAULT '2025-2026',
  amount_expected DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
  status payment_status DEFAULT 'pending',
  payment_method TEXT,
  payment_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_id, season)
);

ALTER TABLE cotisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all cotisations"
  ON cotisations FOR SELECT
  USING (true);

CREATE POLICY "Coaches can manage cotisations"
  ON cotisations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- Payment history (individual payments)
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotisation_id UUID REFERENCES cotisations(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT,
  payment_date DATE DEFAULT CURRENT_DATE,
  recorded_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payment history"
  ON payment_history FOR SELECT
  USING (true);

CREATE POLICY "Coaches can manage payment history"
  ON payment_history FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_licences_player ON licences(player_id);
CREATE INDEX IF NOT EXISTS idx_licences_season ON licences(season);
CREATE INDEX IF NOT EXISTS idx_cotisations_player ON cotisations(player_id);
CREATE INDEX IF NOT EXISTS idx_cotisations_season ON cotisations(season);
CREATE INDEX IF NOT EXISTS idx_cotisations_status ON cotisations(status);
CREATE INDEX IF NOT EXISTS idx_payment_history_cotisation ON payment_history(cotisation_id);
