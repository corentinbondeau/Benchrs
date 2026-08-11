-- 063 : Enrichissement profil joueur + journal d'activité + fil d'actualité club
--        + carnet de match + alerte temps de jeu + relances auto + planning éducateurs

-- ---------- 1. Profil joueur enrichi ----------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_foot TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS height_cm INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5,1);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS secondary_positions TEXT[] NOT NULL DEFAULT '{}';

-- ---------- 2. Journal d'activité (club-wide) ----------
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_team_created ON activity_logs(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_club_created ON activity_logs(club_id, created_at DESC);
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view activity logs" ON activity_logs
  FOR SELECT USING (
    team_id IN (SELECT public.user_visible_team_ids())
    OR (club_id IS NOT NULL AND club_id IN (SELECT public.user_club_ids()))
  );
CREATE POLICY "Members insert activity logs" ON activity_logs
  FOR INSERT WITH CHECK (
    team_id IN (SELECT public.user_visible_team_ids())
    OR (club_id IS NOT NULL AND club_id IN (SELECT public.user_club_ids()))
  );
CREATE POLICY "Coaches delete activity logs" ON activity_logs
  FOR DELETE USING (
    public.is_team_coach(team_id)
    OR (club_id IS NOT NULL AND public.is_club_president(club_id))
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON activity_logs TO authenticated;

-- ---------- 3. Fil d'actualité du club ----------
CREATE TABLE IF NOT EXISTS club_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  media_url TEXT,
  storage_path TEXT,
  media_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_club_posts_club_created ON club_posts(club_id, created_at DESC);
ALTER TABLE club_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club members view posts" ON club_posts
  FOR SELECT USING (
    team_id IN (SELECT public.user_visible_team_ids())
    OR club_id IN (SELECT public.user_club_ids())
  );
CREATE POLICY "Club members insert posts" ON club_posts
  FOR INSERT WITH CHECK (
    team_id IN (SELECT public.user_visible_team_ids())
    OR club_id IN (SELECT public.user_club_ids())
  );
CREATE POLICY "Coaches delete posts" ON club_posts
  FOR DELETE USING (
    public.is_team_coach(team_id)
    OR public.is_club_president(club_id)
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON club_posts TO authenticated;

-- Bucket de stockage public dédié au fil d'actualité (photos/vidéos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('club_feed', 'club_feed', true, 15728640, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime'])
ON CONFLICT (id) DO NOTHING;

-- Chemins : club_feed/<club_id>/<post_id>.<ext>
CREATE POLICY "Public read club_feed" ON storage.objects
  FOR SELECT USING (bucket_id = 'club_feed');

CREATE POLICY "Members upload club_feed" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'club_feed'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1]::uuid IN (SELECT public.user_club_ids())
      OR (storage.foldername(name))[1]::uuid IN (
        SELECT t.club_id FROM teams t
        WHERE t.id IN (SELECT public.user_visible_team_ids()) AND t.club_id IS NOT NULL
      )
    )
  );

CREATE POLICY "Members update club_feed" ON storage.objects
  FOR UPDATE USING (bucket_id = 'club_feed' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'club_feed' AND auth.role() = 'authenticated');

CREATE POLICY "Coaches delete club_feed" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'club_feed'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1]::uuid IN (SELECT public.user_club_ids())
      OR public.is_team_coach((storage.foldername(name))[1]::uuid)
    )
  );

-- ---------- 4. Carnet de match du joueur ----------
CREATE TABLE IF NOT EXISTS player_notebook_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  performance INTEGER NOT NULL DEFAULT 5 CHECK (performance BETWEEN 1 AND 10),
  notable_events TEXT,
  improvements TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_notebook_player ON player_notebook_entries(player_id, created_at DESC);
ALTER TABLE player_notebook_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view notebook entries" ON player_notebook_entries
  FOR SELECT USING (
    team_id IN (SELECT public.user_visible_team_ids())
    OR player_id = auth.uid()
  );
CREATE POLICY "Players manage own notebook" ON player_notebook_entries
  FOR ALL USING (player_id = auth.uid()) WITH CHECK (player_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON player_notebook_entries TO authenticated;

-- ---------- 5. Réglages temps de jeu + relances ----------
ALTER TABLE team_settings ADD COLUMN IF NOT EXISTS min_playing_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE team_settings ADD COLUMN IF NOT EXISTS attendance_reminders_enabled BOOLEAN NOT NULL DEFAULT true;

-- ---------- 6. Planning éducateurs ----------
-- Répartition par exercice : chaque exercice de la fiche (exercise_index = position
-- dans la séance, 0-based) a UN responsable. exercise_index NULL = anciennes
-- affectations au niveau de l'événement (conservées en lecture).
CREATE TABLE IF NOT EXISTS educator_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  exercise_index INTEGER,
  role TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- UNIQUE partiel : une seule affectation par exercice (NULLs libres = événement)
CREATE UNIQUE INDEX IF NOT EXISTS educator_plans_exercise_uq
  ON educator_plans(team_id, event_id, exercise_index) WHERE exercise_index IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_educator_plans_team ON educator_plans(team_id, created_at DESC);
ALTER TABLE educator_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view educator plans" ON educator_plans
  FOR SELECT USING (team_id IN (SELECT public.user_visible_team_ids()));
CREATE POLICY "Coaches manage educator plans" ON educator_plans
  FOR ALL USING (public.is_team_coach(team_id)) WITH CHECK (public.is_team_coach(team_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON educator_plans TO authenticated;
