
-- Add timestamp to record when an agent starts processing a request
ALTER TABLE public.verification_requests
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

-- Update claim_request function to stamp processing_started_at
CREATE OR REPLACE FUNCTION public.claim_request(
  p_request_id uuid,
  p_agent_id   uuid
)
RETURNS verification_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row verification_requests;
BEGIN
  -- 1. Check agent does not already have a processing request
  IF EXISTS (
    SELECT 1 FROM verification_requests
    WHERE agent_id = p_agent_id
      AND status   = 'processing'
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'AGENT_BUSY: vous avez déjà une demande en cours de traitement.';
  END IF;

  -- 2. Lock + fetch the target request atomically
  SELECT * INTO v_row
  FROM verification_requests
  WHERE id     = p_request_id
    AND status = 'pending'
    AND (agent_id IS NULL OR agent_id = p_agent_id)
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_UNAVAILABLE: cette demande n''est plus disponible.';
  END IF;

  -- 3. Claim it and stamp processing_started_at
  UPDATE verification_requests
  SET status                = 'processing',
      agent_id              = p_agent_id,
      processing_started_at = now(),
      updated_at            = now()
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_request(uuid, uuid) TO authenticated;
