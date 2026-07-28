DROP POLICY IF EXISTS "Coaches can delete gallery_media" ON gallery_media;

CREATE POLICY "Coaches can delete gallery_media"
  ON gallery_media FOR DELETE
  USING (
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND (role = 'coach' OR role = 'owner')
    )
  );
