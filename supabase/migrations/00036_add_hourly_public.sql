CREATE OR REPLACE FUNCTION get_public_dashboard_data(link_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_link public.public_links;
  v_kpi json;
  v_chart json;
  v_hourly json;
  v_extra json;
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

  -- 24 hours hourly volume
  WITH hours AS (
    SELECT generate_series(0, 23) as h
  )
  SELECT COALESCE(json_agg(json_build_object(
    'hour', TO_CHAR(h, 'FM00') || 'h',
    'received', (SELECT count(*) FROM public.verification_requests WHERE created_at >= current_date AND extract(hour FROM created_at) = h),
    'accepted', (SELECT count(*) FROM public.verification_requests WHERE created_at >= current_date AND status='accepted' AND extract(hour FROM created_at) = h),
    'rejected', (SELECT count(*) FROM public.verification_requests WHERE created_at >= current_date AND status='rejected' AND extract(hour FROM created_at) = h),
    'pending', (SELECT count(*) FROM public.verification_requests WHERE created_at >= current_date AND status='pending' AND extract(hour FROM created_at) = h),
    'other', (SELECT count(*) FROM public.verification_requests WHERE created_at >= current_date AND status IN ('other', 'unchanged') AND extract(hour FROM created_at) = h)
  )), '[]'::json) INTO v_hourly FROM hours;

  -- fetch extra
  SELECT get_internal_extra_stats() INTO v_extra;

  RETURN json_build_object(
    'kpi', v_kpi,
    'chart', '[]'::json,
    'hourly', v_hourly,
    'coach', v_extra->'coach',
    'locality', v_extra->'locality'
  );
END;
$$;
