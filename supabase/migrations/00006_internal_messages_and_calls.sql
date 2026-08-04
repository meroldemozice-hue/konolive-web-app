
-- ── Internal messages between agents/supervisors ──────────────
CREATE TABLE IF NOT EXISTS public.internal_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content     text,
  image_url   text,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_or_image CHECK (content IS NOT NULL OR image_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_internal_messages_sender   ON public.internal_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_internal_messages_receiver ON public.internal_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_internal_messages_created  ON public.internal_messages(created_at DESC);

ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own internal messages"
  ON public.internal_messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Agents and supervisors can send internal messages"
  ON public.internal_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('agent','supervisor','admin')
    )
  );

CREATE POLICY "Users can mark their received messages as read"
  ON public.internal_messages FOR UPDATE
  USING (auth.uid() = receiver_id);

-- ── Internal call rooms (agent conference calls) ──────────────
CREATE TABLE IF NOT EXISTS public.internal_calls (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participants  uuid[] NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'initiated'
                CHECK (status IN ('initiated','active','ended')),
  started_at    timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_calls_initiator ON public.internal_calls(initiator_id);
CREATE INDEX IF NOT EXISTS idx_internal_calls_created   ON public.internal_calls(created_at DESC);

ALTER TABLE public.internal_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their calls"
  ON public.internal_calls FOR SELECT
  USING (
    auth.uid() = initiator_id OR
    auth.uid() = ANY(participants)
  );

CREATE POLICY "Agents and supervisors can create calls"
  ON public.internal_calls FOR INSERT
  WITH CHECK (
    auth.uid() = initiator_id AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('agent','supervisor','admin')
    )
  );

CREATE POLICY "Participants can update call status"
  ON public.internal_calls FOR UPDATE
  USING (
    auth.uid() = initiator_id OR
    auth.uid() = ANY(participants)
  );
