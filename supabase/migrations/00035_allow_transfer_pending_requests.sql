CREATE OR REPLACE FUNCTION public.transfer_request(
  p_request_id uuid,
  p_new_agent_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.verification_requests
  SET
    agent_id = p_new_agent_id,
    processing_started_at = now(),
    status = 'processing'
  WHERE id = p_request_id
    AND status IN ('processing', 'pending');
END;
$$;