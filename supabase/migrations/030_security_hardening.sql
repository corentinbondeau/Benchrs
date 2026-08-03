-- Security hardening
-- 1) profiles : interdire l'insertion d'un profil pour un autre utilisateur
-- 2) parent_student : seul le parent concerné peut gérer ses liens
-- 3) storage gallery : chacun ne peut uploader/modifier/supprimer que SES fichiers
-- 4) storage physical_docs : seuls les coachs/owners de l'équipe gèrent les fichiers
-- 5) update_player_vma : coach limité aux joueurs de SES équipes
-- Idempotent : peut être relancé sans risque.

-- ============================================================
-- 1) PROFILES : INSERT limité à soi-même
-- ============================================================
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- 2) PARENT_STUDENT : gestion réservée au parent concerné
-- ============================================================
DROP POLICY IF EXISTS "Members can manage parent_student" ON public.parent_student;

CREATE POLICY "Users can manage own parent links"
  ON public.parent_student FOR ALL
  USING (
    auth.uid() = parent_id
    AND team_id IN (SELECT public.user_team_ids())
  )
  WITH CHECK (
    auth.uid() = parent_id
    AND team_id IN (SELECT public.user_team_ids())
  );

-- ============================================================
-- 3) STORAGE gallery : fichiers scellés au dossier de l'uploader
--    (chemin : gallery/<user_id>/<fichier>)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can upload gallery" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update gallery" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete gallery" ON storage.objects;

CREATE POLICY "Users can upload own gallery objects"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'gallery'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Users can update own gallery objects"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'gallery'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Users can delete own gallery objects"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'gallery'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- ============================================================
-- 4) STORAGE physical_docs : réservé aux coachs/owners de l'équipe
--    (chemin : <team_id>/<fichier>)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_team_coach(team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = auth.uid()
      AND team_id = $1
      AND role IN ('owner', 'coach')
  );
$$;

DROP POLICY IF EXISTS "Coaches can upload physical_docs" ON storage.objects;
DROP POLICY IF EXISTS "Coaches can update physical_docs" ON storage.objects;
DROP POLICY IF EXISTS "Coaches can delete physical_docs" ON storage.objects;

CREATE POLICY "Coaches can upload physical_docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'physical_docs'
    AND auth.role() = 'authenticated'
    AND public.is_team_coach((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Coaches can update physical_docs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'physical_docs'
    AND public.is_team_coach((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Coaches can delete physical_docs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'physical_docs'
    AND public.is_team_coach((storage.foldername(name))[1]::uuid)
  );

-- ============================================================
-- 5) update_player_vma : coach limité aux joueurs de SES équipes
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_player_vma(player_id UUID, new_vma NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'coach')
      AND EXISTS (
        SELECT 1 FROM public.team_members tp
        WHERE tp.team_id = tm.team_id
          AND tp.user_id = player_id
      )
  ) THEN
    UPDATE public.profiles SET vma = new_vma WHERE id = player_id;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$;
