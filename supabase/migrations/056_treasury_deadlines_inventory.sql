-- 056 : Trésorerie (dépenses/recettes), échéances (licences, certificats, cotisations) et inventaire (prêt de matériel)

-- ==================== TRÉSORERIE — dépenses & recettes ====================
CREATE TABLE IF NOT EXISTS treasury_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  label TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  category TEXT NOT NULL DEFAULT 'autre',
  txn_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treasury_team ON treasury_transactions(team_id);
ALTER TABLE treasury_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view treasury_transactions" ON treasury_transactions
  FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()));
CREATE POLICY "Coaches can manage treasury_transactions" ON treasury_transactions
  FOR ALL USING (public.is_team_coach(team_id)) WITH CHECK (public.is_team_coach(team_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON treasury_transactions TO authenticated;

-- ==================== ÉCHÉANCES ====================
-- Dates d'expiration portées sur le profil joueur
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS licence_expires_at DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS medical_cert_expires_at DATE;
CREATE INDEX IF NOT EXISTS idx_profiles_licence_expiry ON profiles(licence_expires_at) WHERE licence_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_medical_expiry ON profiles(medical_cert_expires_at) WHERE medical_cert_expires_at IS NOT NULL;

-- Date d'échéance de la cotisation de la saison
ALTER TABLE cotisations ADD COLUMN IF NOT EXISTS due_date DATE;
CREATE INDEX IF NOT EXISTS idx_cotisations_due_date ON cotisations(due_date) WHERE due_date IS NOT NULL;

-- RPC coach pour mettre à jour les échéances d'un joueur
CREATE OR REPLACE FUNCTION public.update_player_deadlines(
  p_player_id UUID,
  p_licence_expires_at DATE,
  p_medical_cert_expires_at DATE
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'player_id requis';
  END IF;
  SELECT team_id INTO v_team_id FROM team_members
    WHERE user_id = p_player_id AND role = 'player' LIMIT 1;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Joueur introuvable';
  END IF;
  IF NOT public.is_team_coach(v_team_id) THEN
    RAISE EXCEPTION 'Accès réservé aux coachs';
  END IF;
  UPDATE profiles
    SET licence_expires_at = p_licence_expires_at,
        medical_cert_expires_at = p_medical_cert_expires_at,
        updated_at = now()
    WHERE id = p_player_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_player_deadlines TO authenticated;

-- ==================== INVENTAIRE & PRÊT DE MATÉRIEL ====================
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'autre' CHECK (category IN ('maillots', 'ballons', 'trousses', 'medical', 'autre')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_team ON inventory_items(team_id);
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view inventory_items" ON inventory_items
  FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()));
CREATE POLICY "Coaches can manage inventory_items" ON inventory_items
  FOR ALL USING (public.is_team_coach(team_id)) WITH CHECK (public.is_team_coach(team_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_items TO authenticated;

CREATE TABLE IF NOT EXISTS item_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  loaned_at DATE NOT NULL DEFAULT CURRENT_DATE,
  returned_at DATE,
  condition_note TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_item_loans_team ON item_loans(team_id);
CREATE INDEX IF NOT EXISTS idx_item_loans_item ON item_loans(item_id);
ALTER TABLE item_loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view item_loans" ON item_loans
  FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()));
CREATE POLICY "Coaches can manage item_loans" ON item_loans
  FOR ALL USING (public.is_team_coach(team_id)) WITH CHECK (public.is_team_coach(team_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON item_loans TO authenticated;
