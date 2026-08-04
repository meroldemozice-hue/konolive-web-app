
-- Fonction SQL : retourne les demandes en cours depuis >7 min sans clôture
CREATE OR REPLACE FUNCTION public.get_overtime_requests()
RETURNS TABLE (
  id uuid,
  applicant_id uuid,
  agent_id uuid,
  processing_started_at timestamptz,
  elapsed_minutes numeric,
  applicant_username text,
  applicant_phone text,
  agent_username text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    vr.id,
    vr.applicant_id,
    vr.agent_id,
    vr.processing_started_at,
    ROUND(EXTRACT(EPOCH FROM (now() - vr.processing_started_at)) / 60, 1) AS elapsed_minutes,
    ap.username  AS applicant_username,
    ap.phone     AS applicant_phone,
    ag.username  AS agent_username
  FROM public.verification_requests vr
  LEFT JOIN public.profiles ap ON ap.id = vr.applicant_id
  LEFT JOIN public.profiles ag ON ag.id = vr.agent_id
  WHERE vr.status = 'processing'
    AND vr.processing_started_at IS NOT NULL
    AND vr.processing_started_at < now() - INTERVAL '7 minutes'
  ORDER BY vr.processing_started_at ASC;
$$;

-- Fonction SQL : transfert atomique d'une demande à un autre agent
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
    processing_started_at = now()
  WHERE id = p_request_id
    AND status = 'processing';
END;
$$;
