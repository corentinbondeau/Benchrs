-- 058 : Identité visuelle des équipes — logo & bannière personnalisés (bucket storage dédié)

ALTER TABLE teams ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS banner_url TEXT;

-- Bucket de stockage public dédié à l'identité visuelle
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('team_branding', 'team_branding', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Chemins : team_branding/<team_id>/logo.<ext> | team_branding/<team_id>/banner.<ext>
-- Lecture publique
CREATE POLICY "Public read team_branding" ON storage.objects
  FOR SELECT USING (bucket_id = 'team_branding');

-- Upload/remplacement réservé aux coachs/owners de l'équipe du premier segment du chemin
CREATE POLICY "Coaches upload team_branding" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'team_branding'
    AND auth.role() = 'authenticated'
    AND public.is_team_coach((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Coaches update team_branding" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'team_branding'
    AND auth.role() = 'authenticated'
    AND public.is_team_coach((storage.foldername(name))[1]::uuid)
  ) WITH CHECK (
    bucket_id = 'team_branding'
    AND auth.role() = 'authenticated'
    AND public.is_team_coach((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Coaches delete team_branding" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'team_branding'
    AND auth.role() = 'authenticated'
    AND public.is_team_coach((storage.foldername(name))[1]::uuid)
  );
