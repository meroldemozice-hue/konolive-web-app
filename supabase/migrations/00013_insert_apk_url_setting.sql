
INSERT INTO public.app_settings (key, value)
VALUES ('apk_url', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('apk-files', 'apk-files', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "apk_public_read" ON storage.objects;
CREATE POLICY "apk_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'apk-files');

DROP POLICY IF EXISTS "apk_admin_upload" ON storage.objects;
CREATE POLICY "apk_admin_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'apk-files'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "apk_admin_update" ON storage.objects;
CREATE POLICY "apk_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'apk-files'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "apk_admin_delete" ON storage.objects;
CREATE POLICY "apk_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'apk-files'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
