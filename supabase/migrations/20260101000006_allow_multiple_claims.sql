-- Allow agents to manually claim multiple requests by removing the AGENT_BUSY check.
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
