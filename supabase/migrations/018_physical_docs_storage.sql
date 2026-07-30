INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('physical_docs', 'physical_docs', true, 52428800, '{"application/pdf"}')
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Team members can view physical_docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'physical_docs');

CREATE POLICY "Coaches can upload physical_docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'physical_docs'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Coaches can update physical_docs"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'physical_docs' AND auth.role() = 'authenticated');

CREATE POLICY "Coaches can delete physical_docs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'physical_docs' AND auth.role() = 'authenticated');
