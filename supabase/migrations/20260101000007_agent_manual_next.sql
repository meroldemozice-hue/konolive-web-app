ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS manual_next_request boolean DEFAULT false;
