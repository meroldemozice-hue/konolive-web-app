CREATE OR REPLACE FUNCTION get_security_question(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_question TEXT;
BEGIN
  SELECT security_question INTO v_question
  FROM public.profiles
  WHERE username = p_username;
  
  RETURN v_question;
END;
$$;