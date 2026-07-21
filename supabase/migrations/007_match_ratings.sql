-- Migration 007: Match ratings

CREATE TABLE IF NOT EXISTS match_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rater_id TEXT NOT NULL REFERENCES profiles(id),
  player_id TEXT NOT NULL REFERENCES profiles(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, rater_id, player_id)
);

ALTER TABLE match_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read match_ratings" ON match_ratings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Players can rate their own" ON match_ratings FOR INSERT WITH CHECK (auth.uid() = rater_id);
CREATE POLICY "Players can update their own ratings" ON match_ratings FOR UPDATE USING (auth.uid() = rater_id);
