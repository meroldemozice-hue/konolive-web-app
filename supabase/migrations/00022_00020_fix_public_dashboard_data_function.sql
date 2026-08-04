CREATE OR REPLACE FUNCTION get_public_dashboard_data(link_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_link public.public_links;
  v_kpi json;
  v_agents json;
BEGIN
  SELECT * INTO v_link FROM public.public_links WHERE id = link_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or inactive public link';
  END IF;

  SELECT json_build_object(
    'totalReceived', (SELECT count(*) FROM public.verification_requests),
    'todayReceived', (SELECT count(*) FROM public.verification_requests WHERE created_at >= current_date),
    'accepted', (SELECT count(*) FROM public.verification_requests WHERE status = 'accepted'),
    'rejected', (SELECT count(*) FROM public.verification_requests WHERE status = 'rejected'),
    'unchanged', (SELECT count(*) FROM public.verification_requests WHERE status = 'unchanged'),
    'pending', (SELECT count(*) FROM public.verification_requests WHERE status = 'pending'),
    'processing', (SELECT count(*) FROM public.verification_requests WHERE status = 'processing')
  ) INTO v_kpi;

  SELECT COALESCE(json_agg(
    json_build_object(
      'id', p.id,
      'username', p.username,
      'totalProcessed', (SELECT count(*) FROM public.verification_requests WHERE agent_id = p.id AND status IN ('accepted','rejected','unchanged')),
      'accepted', (SELECT count(*) FROM public.verification_requests WHERE agent_id = p.id AND status = 'accepted'),
      'rejected', (SELECT count(*) FROM public.verification_requests WHERE agent_id = p.id AND status = 'rejected'),
      'unchanged', (SELECT count(*) FROM public.verification_requests WHERE agent_id = p.id AND status = 'unchanged'),
      'avgProcessingTime', 
        (SELECT COALESCE(avg(EXTRACT(EPOCH FROM (processed_at - processing_started_at))), 0) 
         FROM public.verification_requests 
         WHERE agent_id = p.id AND status IN ('accepted','rejected','unchanged')),
      'todayProcessed',
        (SELECT count(*) 
         FROM public.verification_requests 
         WHERE agent_id = p.id AND status IN ('accepted','rejected','unchanged') AND processed_at >= current_date)
    )
  ), '[]'::json)
  INTO v_agents
  FROM public.profiles p
  WHERE p.role IN ('agent');

  RETURN json_build_object(
    'kpi', v_kpi,
    'agents', v_agents
  );
END;
$$;