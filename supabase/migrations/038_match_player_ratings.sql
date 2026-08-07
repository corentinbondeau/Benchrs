-- Notes entre joueurs et parents sur un match
-- Les joueurs présents et leurs parents notent les joueurs présents au match (1-10).
-- Un joueur ne peut PAS se noter lui-même (contrainte vérifiée en application).
-- Un rater ne peut donner qu'une note par joueur (UNIQUE event_id + rater_id + player_id).
CREATE TABLE IF NOT EXISTS match_player_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, rater_id, player_id)
);

ALTER TABLE match_player_ratings ENABLE ROW LEVEL SECURITY;

-- Un membre de l'équipe peut voir les notes
CREATE POLICY "Members can view match_player_ratings"
  ON public.match_player_ratings FOR SELECT
  USING (
    team_id IN (SELECT public.user_team_ids())
  );

-- Chacun ne gère que SES propres notes
CREATE POLICY "Users can manage own match_player_ratings"
  ON public.match_player_ratings FOR ALL
  USING (
    auth.uid() = rater_id
    AND team_id IN (SELECT public.user_team_ids())
  )
  WITH CHECK (
    auth.uid() = rater_id
    AND team_id IN (SELECT public.user_team_ids())
  );

CREATE INDEX IF NOT EXISTS idx_match_player_ratings_event ON match_player_ratings(event_id);
CREATE INDEX IF NOT EXISTS idx_match_player_ratings_player ON match_player_ratings(player_id);
