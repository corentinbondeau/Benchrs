-- 060 : Checklist avant-match (crampons, protège-tibias, gourde…) + accusé de réception des joueurs

CREATE TABLE IF NOT EXISTS match_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, label)
);
CREATE INDEX IF NOT EXISTS idx_checklist_items_event ON match_checklist_items(event_id);
ALTER TABLE match_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view checklist items" ON match_checklist_items
  FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()));
CREATE POLICY "Coaches manage checklist items" ON match_checklist_items
  FOR ALL USING (public.is_team_coach(team_id)) WITH CHECK (public.is_team_coach(team_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON match_checklist_items TO authenticated;

-- Un joueur confirme avoir pris connaissance de la checklist (1 ligne par joueur/événement)
CREATE TABLE IF NOT EXISTS match_checklist_acks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_checklist_acks_event ON match_checklist_acks(event_id);
ALTER TABLE match_checklist_acks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view checklist acks" ON match_checklist_acks
  FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()));
CREATE POLICY "Players manage own acks" ON match_checklist_acks
  FOR ALL USING (player_id = auth.uid()) WITH CHECK (player_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON match_checklist_acks TO authenticated;
