-- 044_weekly_challenges.sql
-- Défi de la semaine : un défi généré par IA par équipe et par semaine, validé par photo/vidéo,
-- avec classement. La difficulté (facile/moyen/difficile) est choisie par les coachs dans les paramètres
-- de l'équipe (weekly_challenge_settings, éditable par les coachs via public.is_team_coach).

CREATE TABLE IF NOT EXISTS public.weekly_challenge_settings (
  team_id UUID PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  difficulty TEXT NOT NULL DEFAULT 'moyen' CHECK (difficulty IN ('facile', 'moyen', 'difficile')),
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_challenge_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view weekly_challenge_settings" ON public.weekly_challenge_settings;
CREATE POLICY "Members can view weekly_challenge_settings"
  ON public.weekly_challenge_settings FOR SELECT
  USING (team_id IN (SELECT public.user_team_ids()));

DROP POLICY IF EXISTS "Coaches can manage weekly_challenge_settings" ON public.weekly_challenge_settings;
CREATE POLICY "Coaches can manage weekly_challenge_settings"
  ON public.weekly_challenge_settings FOR ALL
  USING (public.is_team_coach(team_id))
  WITH CHECK (public.is_team_coach(team_id));

CREATE TABLE IF NOT EXISTS public.weekly_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'moyen' CHECK (difficulty IN ('facile', 'moyen', 'difficile')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_challenges_team_week ON public.weekly_challenges(team_id, week_start DESC);

ALTER TABLE public.weekly_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view weekly_challenges" ON public.weekly_challenges;
CREATE POLICY "Members can view weekly_challenges"
  ON public.weekly_challenges FOR SELECT
  USING (team_id IN (SELECT public.user_team_ids()));

DROP POLICY IF EXISTS "Coaches can manage weekly_challenges" ON public.weekly_challenges;
CREATE POLICY "Coaches can manage weekly_challenges"
  ON public.weekly_challenges FOR ALL
  USING (public.is_team_coach(team_id))
  WITH CHECK (public.is_team_coach(team_id));

CREATE TABLE IF NOT EXISTS public.challenge_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES public.weekly_challenges(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'rejected')),
  validated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_submissions_challenge ON public.challenge_submissions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_submissions_player ON public.challenge_submissions(player_id);

ALTER TABLE public.challenge_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view challenge_submissions" ON public.challenge_submissions;
CREATE POLICY "Members can view challenge_submissions"
  ON public.challenge_submissions FOR SELECT
  USING (team_id IN (SELECT public.user_team_ids()));

DROP POLICY IF EXISTS "Players can submit own challenge" ON public.challenge_submissions;
CREATE POLICY "Players can submit own challenge"
  ON public.challenge_submissions FOR INSERT
  WITH CHECK (
    auth.uid() = player_id
    AND team_id IN (SELECT public.user_team_ids())
  );

DROP POLICY IF EXISTS "Players can update own pending challenge" ON public.challenge_submissions;
CREATE POLICY "Players can update own pending challenge"
  ON public.challenge_submissions FOR UPDATE
  USING (
    auth.uid() = player_id
    AND status IN ('pending', 'rejected')
  )
  WITH CHECK (
    auth.uid() = player_id
    AND status IN ('pending', 'rejected')
  );

DROP POLICY IF EXISTS "Coaches can manage challenge_submissions" ON public.challenge_submissions;
CREATE POLICY "Coaches can manage challenge_submissions"
  ON public.challenge_submissions FOR ALL
  USING (public.is_team_coach(team_id))
  WITH CHECK (public.is_team_coach(team_id));

-- ============================================================
-- Storage : bucket challenge_media (photo/vidéo des défis)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('challenge_media', 'challenge_media', true, 52428800, '{"image/*", "video/*"}')
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Members can view challenge_media" ON storage.objects;
CREATE POLICY "Members can view challenge_media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'challenge_media');

DROP POLICY IF EXISTS "Members can upload challenge_media" ON storage.objects;
CREATE POLICY "Members can upload challenge_media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'challenge_media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.user_team_ids())
  );

DROP POLICY IF EXISTS "Users can delete own challenge_media" ON storage.objects;
CREATE POLICY "Users can delete own challenge_media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'challenge_media'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
