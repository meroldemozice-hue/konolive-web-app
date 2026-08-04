ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS security_question TEXT,
ADD COLUMN IF NOT EXISTS security_answer TEXT;

-- Ensure pgcrypto exists
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create an RPC to reset password
CREATE OR REPLACE FUNCTION reset_user_password(
  p_username TEXT,
  p_question TEXT,
  p_answer TEXT,
  p_new_password TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_db_question TEXT;
  v_db_answer TEXT;
BEGIN
  -- Find the user profile by username
  SELECT id, security_question, security_answer 
  INTO v_user_id, v_db_question, v_db_answer
  FROM public.profiles
  WHERE username = p_username;

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if question and answer match (case-insensitive for answer to be forgiving)
  IF v_db_question = p_question AND lower(trim(v_db_answer)) = lower(trim(p_answer)) THEN
    -- Update password in auth.users
    UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf'))
    WHERE id = v_user_id;

    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;
