
-- Create public bucket for internal discussion media (agent-to-agent images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'internal-media',
  'internal-media',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
);

-- Allow agents and supervisors to upload their own files
CREATE POLICY "Agents/supervisors can upload internal media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'internal-media' AND
    auth.uid()::text = (string_to_array(name, '/'))[2] AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('agent','supervisor','admin')
    )
  );

-- Allow authenticated users to read all internal media
CREATE POLICY "Authenticated users can read internal media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'internal-media' AND
    auth.role() = 'authenticated'
  );

-- Allow owners to delete their own uploads
CREATE POLICY "Owners can delete their internal media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'internal-media' AND
    auth.uid()::text = (string_to_array(name, '/'))[2]
  );
