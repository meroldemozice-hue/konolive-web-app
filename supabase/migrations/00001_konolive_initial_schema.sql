
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Roles enum
CREATE TYPE public.user_role AS ENUM ('applicant', 'agent', 'supervisor', 'admin');

-- Request status enum
CREATE TYPE public.request_status AS ENUM ('pending', 'processing', 'accepted', 'rejected', 'unchanged');

-- Notification type enum
CREATE TYPE public.notification_type AS ENUM ('new_request', 'request_assigned', 'status_changed', 'new_message', 'call_started', 'call_ended');

-- ========================
-- PROFILES TABLE
-- ========================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  email text UNIQUE,
  phone text,
  locality text,
  role public.user_role NOT NULL DEFAULT 'applicant',
  is_active boolean NOT NULL DEFAULT true,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- VERIFICATION REQUESTS TABLE
-- ========================
CREATE TABLE public.verification_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  applicant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  phone_to_certify text NOT NULL,
  status public.request_status NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_duration_seconds integer
);

-- ========================
-- REQUEST DOCUMENTS TABLE
-- ========================
CREATE TABLE public.request_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id uuid NOT NULL REFERENCES public.verification_requests(id) ON DELETE CASCADE,
  doc_front_url text,
  doc_back_url text,
  live_photo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- VIDEO CALLS TABLE
-- ========================
CREATE TABLE public.video_calls (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id uuid NOT NULL REFERENCES public.verification_requests(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'ringing', 'active', 'ended', 'rejected', 'missed')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- MESSAGES TABLE
-- ========================
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id uuid NOT NULL REFERENCES public.verification_requests(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- NOTIFICATIONS TABLE
-- ========================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  request_id uuid REFERENCES public.verification_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- ACTIVITY LOGS TABLE
-- ========================
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- INDEXES
-- ========================
CREATE INDEX idx_verification_requests_applicant ON public.verification_requests(applicant_id);
CREATE INDEX idx_verification_requests_agent ON public.verification_requests(agent_id);
CREATE INDEX idx_verification_requests_status ON public.verification_requests(status);
CREATE INDEX idx_verification_requests_created ON public.verification_requests(created_at DESC);
CREATE INDEX idx_messages_request ON public.messages(request_id);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_receiver ON public.messages(receiver_id);
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_activity_logs_user ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_created ON public.activity_logs(created_at DESC);

-- ========================
-- UPDATED_AT TRIGGER
-- ========================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_requests_updated_at BEFORE UPDATE ON public.verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========================
-- STORAGE BUCKETS
-- ========================
INSERT INTO storage.buckets (id, name, public) VALUES
  ('id-documents', 'id-documents', false),
  ('live-photos', 'live-photos', false)
ON CONFLICT (id) DO NOTHING;

-- ========================
-- HANDLE NEW USER TRIGGER
-- ========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_username text;
  v_phone text;
  v_locality text;
  v_role public.user_role;
BEGIN
  v_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1)
  );
  v_phone := NEW.raw_user_meta_data->>'phone';
  v_locality := NEW.raw_user_meta_data->>'locality';
  v_role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::public.user_role,
    'applicant'::public.user_role
  );

  INSERT INTO public.profiles (id, username, email, phone, locality, role)
  VALUES (NEW.id, v_username, NEW.email, v_phone, v_locality, v_role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========================
-- HELPER FUNCTIONS
-- ========================
CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS public.user_role
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION public.is_active_user(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT is_active FROM public.profiles WHERE id = uid;
$$;

-- ========================
-- RLS ENABLE
-- ========================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- ========================
-- PROFILES POLICIES
-- ========================
CREATE POLICY "Admins full access profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'admin'::public.user_role);

CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (role IS NOT DISTINCT FROM get_user_role(auth.uid()));

-- Supervisors can view all profiles for stats
CREATE POLICY "Supervisors view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) IN ('supervisor'::public.user_role, 'admin'::public.user_role));

-- Agents can view applicant profiles
CREATE POLICY "Agents view applicant profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) = 'agent'::public.user_role);

-- ========================
-- VERIFICATION REQUESTS POLICIES
-- ========================
CREATE POLICY "Applicants manage own requests" ON public.verification_requests
  FOR ALL TO authenticated
  USING (applicant_id = auth.uid())
  WITH CHECK (applicant_id = auth.uid());

CREATE POLICY "Agents view assigned requests" ON public.verification_requests
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) = 'agent'::public.user_role);

CREATE POLICY "Agents update assigned requests" ON public.verification_requests
  FOR UPDATE TO authenticated
  USING (get_user_role(auth.uid()) = 'agent'::public.user_role AND (agent_id = auth.uid() OR agent_id IS NULL))
  WITH CHECK (get_user_role(auth.uid()) = 'agent'::public.user_role);

CREATE POLICY "Supervisors view all requests" ON public.verification_requests
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) = 'supervisor'::public.user_role);

CREATE POLICY "Admins full access requests" ON public.verification_requests
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'admin'::public.user_role);

-- ========================
-- REQUEST DOCUMENTS POLICIES
-- ========================
CREATE POLICY "Applicants manage own documents" ON public.request_documents
  FOR ALL TO authenticated
  USING (
    request_id IN (
      SELECT id FROM public.verification_requests WHERE applicant_id = auth.uid()
    )
  )
  WITH CHECK (
    request_id IN (
      SELECT id FROM public.verification_requests WHERE applicant_id = auth.uid()
    )
  );

CREATE POLICY "Agents view documents" ON public.request_documents
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) IN ('agent'::public.user_role, 'supervisor'::public.user_role, 'admin'::public.user_role));

-- ========================
-- VIDEO CALLS POLICIES
-- ========================
CREATE POLICY "Participants view own calls" ON public.video_calls
  FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR applicant_id = auth.uid());

CREATE POLICY "Agents manage calls" ON public.video_calls
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'agent'::public.user_role)
  WITH CHECK (get_user_role(auth.uid()) = 'agent'::public.user_role);

CREATE POLICY "Supervisors view calls" ON public.video_calls
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) IN ('supervisor'::public.user_role, 'admin'::public.user_role));

-- ========================
-- MESSAGES POLICIES
-- ========================
CREATE POLICY "Participants view own messages" ON public.messages
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Authenticated users send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Receivers mark messages read" ON public.messages
  FOR UPDATE TO authenticated
  USING (receiver_id = auth.uid())
  WITH CHECK (receiver_id = auth.uid());

CREATE POLICY "Admins view all messages" ON public.messages
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) = 'admin'::public.user_role);

-- ========================
-- NOTIFICATIONS POLICIES
-- ========================
CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins full access notifications" ON public.notifications
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'admin'::public.user_role);

-- ========================
-- ACTIVITY LOGS POLICIES
-- ========================
CREATE POLICY "Admins view all logs" ON public.activity_logs
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin'::public.user_role, 'supervisor'::public.user_role));

CREATE POLICY "Users insert own logs" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- ========================
-- STORAGE POLICIES
-- ========================
CREATE POLICY "Authenticated users upload id docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'id-documents');

CREATE POLICY "Owners view id docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'id-documents' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR get_user_role(auth.uid()) IN ('agent'::public.user_role, 'supervisor'::public.user_role, 'admin'::public.user_role)
  ));

CREATE POLICY "Authenticated users upload live photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'live-photos');

CREATE POLICY "Owners view live photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'live-photos' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR get_user_role(auth.uid()) IN ('agent'::public.user_role, 'supervisor'::public.user_role, 'admin'::public.user_role)
  ));

-- ========================
-- REALTIME PUBLICATION
-- ========================
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.verification_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_calls;
