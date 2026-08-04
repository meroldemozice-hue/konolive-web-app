-- Allow applicants to update their own video calls (e.g., to set status = 'rejected' or 'ended')
CREATE POLICY "Applicants update own calls" ON public.video_calls
  FOR UPDATE TO authenticated
  USING (applicant_id = auth.uid())
  WITH CHECK (applicant_id = auth.uid());
