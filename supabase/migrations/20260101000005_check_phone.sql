CREATE OR REPLACE FUNCTION public.check_phone_in_progress(p_phone text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.verification_requests
    WHERE phone_to_certify = p_phone
      AND status IN ('pending', 'processing')
  ) INTO v_exists;
  RETURN v_exists;
END;
$$;
