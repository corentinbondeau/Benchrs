-- ============================================================
-- 106_video_analysis.sql
-- Analyse vidéo de match par IA (YOLO + OpenCV, service Python).
--
-- Un dépôt de vidéo = UNE tâche d'analyse : la même ligne porte la
-- vidéo (storage) et l'état du job (pending → processing → completed/
-- failed). Le service Python tourne en tâche de fond (polling) et
-- met à jour progress + result via la SERVICE_ROLE (bypass RLS) ;
-- les membres suivent l'avancement en temps réel (realtime).
-- ============================================================

-- ─── 1. Bucket privé ───
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('match_videos', 'match_videos', false, 1073741824, '{"video/*"}')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. Table video_analyses
-- ============================================================
CREATE TABLE IF NOT EXISTS public.video_analyses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  event_id       uuid REFERENCES public.events(id) ON DELETE SET NULL,
  created_by     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title          text NOT NULL DEFAULT 'Analyse vidéo',
  storage_path   text NOT NULL,                  -- chemin dans le bucket match_videos
  file_name      text,
  mime_type      text,
  size_bytes     bigint,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','processing','completed','failed','canceled')),
  progress       integer NOT NULL DEFAULT 0      -- 0..100
                 CHECK (progress >= 0 AND progress <= 100),
  error          text,
  result         jsonb,                          -- payload de stats + timeline (format Python)
  model_version  text,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_analyses_team_idx   ON public.video_analyses (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS video_analyses_status_idx ON public.video_analyses (status);

-- updated_at automatique pour le rafraîchissement live du front
CREATE OR REPLACE FUNCTION public.touch_video_analysis()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_video_analysis_trg ON public.video_analyses;
CREATE TRIGGER touch_video_analysis_trg
  BEFORE UPDATE ON public.video_analyses
  FOR EACH ROW EXECUTE FUNCTION public.touch_video_analysis();

-- ============================================================
-- 3. RLS
--    - SELECT : membres de l'équipe (RLS sur teams servie par les
--      policies 005 étendues à user_visible_team_ids()) + comité club
--    - INSERT : membres (toute personne de l'équipe peut uploader)
--    - UPDATE : le statut/progress/result sont écrits par le worker
--      (service role) ; côte app, chacun ne peut annuler que sa tâche,
--      les coachs toute tâche de l'équipe
--    - DELETE : créateur OU coach
-- ============================================================
ALTER TABLE public.video_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view video analyses" ON public.video_analyses;
CREATE POLICY "Members can view video analyses"
  ON public.video_analyses FOR SELECT
  USING (
    team_id IN (
      SELECT public.user_visible_team_ids()
    )
  );

DROP POLICY IF EXISTS "Members can insert video analyses" ON public.video_analyses;
CREATE POLICY "Members can insert video analyses"
  ON public.video_analyses FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND team_id IN (
      SELECT public.user_visible_team_ids()
    )
  );

DROP POLICY IF EXISTS "Creator or coach can update video analysis" ON public.video_analyses;
CREATE POLICY "Creator or coach can update video analysis"
  ON public.video_analyses FOR UPDATE
  USING (
    created_by = auth.uid()
    OR team_id IN (
      SELECT public.user_team_ids()
    )
  );

DROP POLICY IF EXISTS "Creator or coach can delete video analysis" ON public.video_analyses;
CREATE POLICY "Creator or coach can delete video analysis"
  ON public.video_analyses FOR DELETE
  USING (
    created_by = auth.uid()
    OR team_id IN (
      SELECT public.user_team_ids()
    )
  );

-- ============================================================
-- 4. Storage RLS (bucket match_videos)
--    Chemins : match_videos/<team_id>/<user_id>/... → équipe = [2],
--    user = [3]. Lecture/upload par les membres de l'équipe du dossier ;
--    suppression par le propriétaire du fichier ou un coach.
--    Le worker lit via la service role (contourne ces policies).
-- ============================================================
DROP POLICY IF EXISTS "Members can view match videos" ON storage.objects;
CREATE POLICY "Members can view match videos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'match_videos'
    AND (storage.foldername(name))[2]::uuid IN (SELECT public.user_visible_team_ids())
  );

DROP POLICY IF EXISTS "Members can upload match videos" ON storage.objects;
CREATE POLICY "Members can upload match videos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'match_videos'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[2]::uuid IN (SELECT public.user_team_ids())
    AND (
      (storage.foldername(name))[3] = auth.uid()::text
      OR public.is_team_coach((storage.foldername(name))[2]::uuid)
    )
  );

DROP POLICY IF EXISTS "Members can update match videos" ON storage.objects;
CREATE POLICY "Members can update match videos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'match_videos'
    AND (storage.foldername(name))[2]::uuid IN (SELECT public.user_visible_team_ids())
  );

DROP POLICY IF EXISTS "Members can delete match videos" ON storage.objects;
CREATE POLICY "Members can delete match videos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'match_videos'
    AND (
      (storage.foldername(name))[3] = auth.uid()::text
      OR public.is_team_coach((storage.foldername(name))[2]::uuid)
    )
  );

-- ============================================================
-- 5. Publication realtime
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.video_analyses;
  END IF;
END $$;