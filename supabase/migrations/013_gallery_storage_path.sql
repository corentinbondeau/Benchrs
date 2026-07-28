ALTER TABLE gallery_media ADD COLUMN IF NOT EXISTS storage_path TEXT;

ALTER TABLE gallery_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can delete own gallery_media" ON gallery_media;
DROP POLICY IF EXISTS "Members can manage gallery_media" ON gallery_media;

CREATE POLICY "Members can view gallery_media"
  ON gallery_media FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "Members can insert gallery_media"
  ON gallery_media FOR INSERT
  WITH CHECK (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "Coaches can delete gallery_media"
  ON gallery_media FOR DELETE
  USING (
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND role = 'coach'
    )
  );
