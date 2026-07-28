DROP POLICY IF EXISTS "Coaches can manage albums" ON albums;
DROP POLICY IF EXISTS "Coaches can insert albums" ON albums;
DROP POLICY IF EXISTS "Members can view albums" ON albums;

CREATE POLICY "Members can view albums"
  ON albums FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "Coaches can insert albums"
  ON albums FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND (role = 'coach' OR role = 'owner')
    )
  );

CREATE POLICY "Coaches can manage albums"
  ON albums FOR ALL
  USING (
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND (role = 'coach' OR role = 'owner')
    )
  );
