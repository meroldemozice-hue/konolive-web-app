
-- ── verification_requests ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vr_status
  ON public.verification_requests(status);

CREATE INDEX IF NOT EXISTS idx_vr_agent_id
  ON public.verification_requests(agent_id);

CREATE INDEX IF NOT EXISTS idx_vr_applicant_id
  ON public.verification_requests(applicant_id);

CREATE INDEX IF NOT EXISTS idx_vr_created_at
  ON public.verification_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vr_status_created_at
  ON public.verification_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vr_agent_status
  ON public.verification_requests(agent_id, status);

-- ── notifications ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notif_user_unread
  ON public.notifications(user_id, is_read, created_at DESC);

-- ── messages ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_msg_request_id
  ON public.messages(request_id, created_at DESC);

-- ── internal_messages ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_int_msg_sender
  ON public.internal_messages(sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_int_msg_receiver
  ON public.internal_messages(receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_int_msg_pair
  ON public.internal_messages(sender_id, receiver_id, created_at DESC);

-- ── video_calls ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vc_request_id
  ON public.video_calls(request_id);

CREATE INDEX IF NOT EXISTS idx_vc_agent_id
  ON public.video_calls(agent_id);

-- ── profiles ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles(role);

CREATE INDEX IF NOT EXISTS idx_profiles_locality
  ON public.profiles(locality);

-- ── activity_logs ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_logs_user_id
  ON public.activity_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_logs_created_at
  ON public.activity_logs(created_at DESC);

-- ── internal_calls ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_internal_calls_status
  ON public.internal_calls(status, created_at DESC);
