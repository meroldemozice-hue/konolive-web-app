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
  v_security_question text;
  v_security_answer text;
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
  v_security_question := NEW.raw_user_meta_data->>'security_question';
  v_security_answer := NEW.raw_user_meta_data->>'security_answer';

  INSERT INTO public.profiles (id, username, email, phone, locality, role, security_question, security_answer)
  VALUES (NEW.id, v_username, NEW.email, v_phone, v_locality, v_role, v_security_question, v_security_answer);
  RETURN NEW;
END;
$$;