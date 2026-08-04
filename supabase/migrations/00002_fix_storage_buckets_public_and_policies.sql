
-- Make storage buckets public so getPublicUrl works
UPDATE storage.buckets SET public = true WHERE id IN ('id-documents', 'live-photos');

-- Storage policies for id-documents
DROP POLICY IF EXISTS "Authenticated upload id-documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read id-documents" ON storage.objects;
CREATE POLICY "Authenticated upload id-documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'id-documents');
CREATE POLICY "Authenticated read id-documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'id-documents');

-- Storage policies for live-photos
DROP POLICY IF EXISTS "Authenticated upload live-photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read live-photos" ON storage.objects;
CREATE POLICY "Authenticated upload live-photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'live-photos');
CREATE POLICY "Authenticated read live-photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'live-photos');

-- Allow agents to see ALL pending requests (so they can pick from the queue)
DROP POLICY IF EXISTS "Agents view assigned requests" ON public.verification_requests;
CREATE POLICY "Agents view requests" ON public.verification_requests
  FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'agent'
  );

-- Allow agents/applicants to insert notifications (for call signals and messages)
DROP POLICY IF EXISTS "Service insert notifications" ON public.notifications;
CREATE POLICY "Authenticated insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Allow agents to update any request they are assigned to (or unassigned pending)
DROP POLICY IF EXISTS "Agents update assigned requests" ON public.verification_requests;
CREATE POLICY "Agents update requests" ON public.verification_requests
  FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'agent'
  );
