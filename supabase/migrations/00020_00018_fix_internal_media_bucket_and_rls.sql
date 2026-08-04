UPDATE storage.buckets 
SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/aac'] 
WHERE id = 'internal-media';

DROP POLICY IF EXISTS "Agents/supervisors can upload internal media" ON storage.objects;
CREATE POLICY "Agents/supervisors can upload internal media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'internal-media' AND
    auth.uid()::text = (string_to_array(name, '/'))[1] AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('agent','supervisor','admin')
    )
  );

DROP POLICY IF EXISTS "Owners can delete their internal media" ON storage.objects;
CREATE POLICY "Owners can delete their internal media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'internal-media' AND
    auth.uid()::text = (string_to_array(name, '/'))[1]
  );