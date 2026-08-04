CREATE OR REPLACE FUNCTION get_public_dashboard_data(link_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_link public.public_links;
  v_kpi json;
  v_chart json;
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

  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_chart FROM (
    SELECT 
      TO_CHAR(date_trunc('hour', created_at), 'HH24:00') as time,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'processing') as processing,
      COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
      COUNT(*) FILTER (WHERE status = 'unchanged') as unchanged,
      COALESCE(AVG(EXTRACT(EPOCH FROM (processed_at - processing_started_at))) FILTER (WHERE status IN ('accepted','rejected','unchanged')), 0) as avgTime
    FROM public.verification_requests
    WHERE created_at >= current_date
    GROUP BY date_trunc('hour', created_at)
    ORDER BY date_trunc('hour', created_at)
  ) t;

  RETURN json_build_object(
    'kpi', v_kpi,
    'chart', v_chart
  );
END;
$$;