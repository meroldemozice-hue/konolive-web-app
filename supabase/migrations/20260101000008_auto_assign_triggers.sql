CREATE OR REPLACE FUNCTION public.auto_assign_request()
RETURNS TRIGGER AS $$
DECLARE
  v_agent_id uuid;
BEGIN
  IF NEW.status = 'pending' THEN
    -- Trouver l'agent disponible (non en pause, actif, loggué) avec le moins de demandes "processing"
    SELECT p.id INTO v_agent_id
    FROM public.profiles p
    LEFT JOIN public.verification_requests vr 
      ON vr.agent_id = p.id AND vr.status = 'processing'
    WHERE p.role = 'agent'
      AND p.is_active = true
      AND p.is_logged_in = true
      AND (p.is_paused = false OR p.is_paused IS NULL)
    GROUP BY p.id
    ORDER BY count(vr.id) ASC, p.updated_at ASC
    LIMIT 1;

    IF v_agent_id IS NOT NULL THEN
      NEW.status := 'processing';
      NEW.agent_id := v_agent_id;
      NEW.processing_started_at := now();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_request_insert_assign ON public.verification_requests;
CREATE TRIGGER on_request_insert_assign
BEFORE INSERT ON public.verification_requests
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_request();

CREATE OR REPLACE FUNCTION public.auto_assign_pending_to_agent()
RETURNS TRIGGER AS $$
DECLARE
  v_pending_req RECORD;
BEGIN
  -- Si l'agent vient de terminer une demande, chercher une demande en attente
  IF OLD.status = 'processing' AND NEW.status IN ('accepted', 'rejected', 'other') THEN
    
    -- Vérifier si l'agent est en pause et loggué
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.agent_id AND (is_paused = false OR is_paused IS NULL) AND is_active = true AND is_logged_in = true) THEN
      
      -- Prendre la plus ancienne demande en attente
      SELECT * INTO v_pending_req
      FROM public.verification_requests
      WHERE status = 'pending'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1;

      IF FOUND THEN
        UPDATE public.verification_requests
        SET status = 'processing',
            agent_id = NEW.agent_id,
            processing_started_at = now()
        WHERE id = v_pending_req.id;
      END IF;

    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_request_finish_assign_next ON public.verification_requests;
CREATE TRIGGER on_request_finish_assign_next
AFTER UPDATE OF status ON public.verification_requests
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_pending_to_agent();

CREATE OR REPLACE FUNCTION public.auto_assign_on_unpause()
RETURNS TRIGGER AS $$
DECLARE
  v_pending_req RECORD;
BEGIN
  -- Si l'agent repasse en mode actif (is_paused passe à false) ou se connecte
  IF (OLD.is_paused = true AND NEW.is_paused = false) OR (OLD.is_logged_in = false AND NEW.is_logged_in = true AND (NEW.is_paused = false OR NEW.is_paused IS NULL)) THEN
    IF NEW.role = 'agent' AND NEW.is_active = true THEN
      -- Prendre la plus ancienne demande en attente
      SELECT * INTO v_pending_req
      FROM public.verification_requests
      WHERE status = 'pending'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1;

      IF FOUND THEN
        UPDATE public.verification_requests
        SET status = 'processing',
            agent_id = NEW.id,
            processing_started_at = now()
        WHERE id = v_pending_req.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_agent_status_change_assign_next ON public.profiles;
CREATE TRIGGER on_agent_status_change_assign_next
AFTER UPDATE OF is_paused, is_logged_in ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_on_unpause();
