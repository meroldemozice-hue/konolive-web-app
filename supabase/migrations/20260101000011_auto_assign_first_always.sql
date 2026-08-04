CREATE OR REPLACE FUNCTION public.auto_assign_request()
RETURNS TRIGGER AS $$
DECLARE
  v_agent_id uuid;
BEGIN
  IF NEW.status = 'pending' THEN
    -- Trouver l'agent disponible (non en pause, actif, loggué) avec EXACTEMENT 0 demande "processing"
    -- IGNORE manual_next_request pour la première demande !
    SELECT p.id INTO v_agent_id
    FROM public.profiles p
    LEFT JOIN public.verification_requests vr 
      ON vr.agent_id = p.id AND vr.status = 'processing'
    WHERE p.role = 'agent'
      AND p.is_active = true
      AND p.is_logged_in = true
      AND (p.is_paused = false OR p.is_paused IS NULL)
    GROUP BY p.id
    HAVING count(vr.id) = 0
    ORDER BY p.updated_at ASC
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

CREATE OR REPLACE FUNCTION public.auto_assign_on_unpause()
RETURNS TRIGGER AS $$
DECLARE
  v_pending_req RECORD;
BEGIN
  -- Si l'agent repasse en mode actif (is_paused passe à false) ou se connecte
  IF (OLD.is_paused = true AND NEW.is_paused = false) OR (OLD.is_logged_in = false AND NEW.is_logged_in = true AND (NEW.is_paused = false OR NEW.is_paused IS NULL)) THEN
    -- IGNORE manual_next_request pour la première demande !
    IF NEW.role = 'agent' AND NEW.is_active = true THEN
      
      -- VÉRIFIER QUE L'AGENT N'A AUCUNE DEMANDE EN COURS !
      IF NOT EXISTS (SELECT 1 FROM public.verification_requests WHERE agent_id = NEW.id AND status = 'processing') THEN
        
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
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
