-- Add coach and locality stats to the public dashboard RPC
CREATE OR REPLACE FUNCTION get_public_dashboard_data(link_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_link public.public_links;
  v_kpi json;
  v_chart json;
  v_coach_stats json;
  v_locality_stats json;
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
    'processing', (SELECT count(*) FROM public.verification_requests WHERE status = 'processing'),
    'autres', (SELECT count(*) FROM public.verification_requests WHERE status = 'other')
  ) INTO v_kpi;

  -- Coach stats
  SELECT json_build_object(
    'total', count(*),
    'online', count(*) FILTER (WHERE is_online = true),
    'offline', count(*) FILTER (WHERE is_online = false OR is_online IS NULL)
  ) INTO v_coach_stats
  FROM public.profiles
  WHERE role = 'applicant';

  -- Locality stats (Today)
  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_locality_stats
  FROM (
    SELECT 
      COALESCE(p.locality, 'Non renseigné') as locality,
      COUNT(r.id) as received,
      COUNT(r.id) FILTER (WHERE r.status = 'accepted') as accepted,
      COUNT(r.id) FILTER (WHERE r.status = 'rejected') as rejected,
      COUNT(r.id) FILTER (WHERE r.status = 'unchanged') as unchanged,
      COUNT(r.id) FILTER (WHERE r.status = 'other') as autres
    FROM public.verification_requests r
    JOIN public.profiles p ON r.applicant_id = p.id
    WHERE r.created_at >= current_date
    GROUP BY p.locality
    ORDER BY received DESC
  ) t;

  -- Create cumulative minute-level chart data
  WITH events AS (
    SELECT created_at as t, 1 as received, 1 as pending, 0 as processing, 0 as accepted, 0 as rejected, 0 as unchanged, 0 as autres
    FROM public.verification_requests WHERE created_at >= current_date
    UNION ALL
    SELECT processing_started_at as t, 0, -1, 1, 0, 0, 0, 0
    FROM public.verification_requests WHERE processing_started_at >= current_date
    UNION ALL
    SELECT processed_at as t, 0, 0, -1, 
           CASE WHEN status='accepted' THEN 1 ELSE 0 END,
           CASE WHEN status='rejected' THEN 1 ELSE 0 END,
           CASE WHEN status='unchanged' THEN 1 ELSE 0 END,
           CASE WHEN status='other' THEN 1 ELSE 0 END
    FROM public.verification_requests WHERE processed_at >= current_date AND status IN ('accepted','rejected','unchanged','other')
  ),
  minute_aggs AS (
    SELECT 
      date_trunc('minute', t) as m,
      SUM(received) as d_received,
      SUM(pending) as d_pending,
      SUM(processing) as d_processing,
      SUM(accepted) as d_accepted,
      SUM(rejected) as d_rejected,
      SUM(unchanged) as d_unchanged,
      SUM(autres) as d_autres
    FROM events
    WHERE t IS NOT NULL
    GROUP BY 1
  ),
  all_minutes AS (
    SELECT generate_series(
      date_trunc('minute', current_date), 
      date_trunc('minute', now()), 
      '1 minute'::interval
    ) as m
  ),
  running_totals AS (
    SELECT 
      a.m,
      SUM(COALESCE(mag.d_received, 0)) OVER (ORDER BY a.m) as received,
      SUM(COALESCE(mag.d_pending, 0)) OVER (ORDER BY a.m) as pending,
      SUM(COALESCE(mag.d_processing, 0)) OVER (ORDER BY a.m) as processing,
      SUM(COALESCE(mag.d_accepted, 0)) OVER (ORDER BY a.m) as accepted,
      SUM(COALESCE(mag.d_rejected, 0)) OVER (ORDER BY a.m) as rejected,
      SUM(COALESCE(mag.d_unchanged, 0)) OVER (ORDER BY a.m) as unchanged,
      SUM(COALESCE(mag.d_autres, 0)) OVER (ORDER BY a.m) as autres
    FROM all_minutes a
    LEFT JOIN minute_aggs mag ON a.m = mag.m
  )
  SELECT COALESCE(json_agg(json_build_object(
    'time', TO_CHAR(m, 'HH24:MI'),
    'received', COALESCE(received, 0),
    'pending', COALESCE(pending, 0),
    'processing', COALESCE(processing, 0),
    'accepted', COALESCE(accepted, 0),
    'rejected', COALESCE(rejected, 0),
    'unchanged', COALESCE(unchanged, 0),
    'autres', COALESCE(autres, 0),
    'avgTime', 0
  )), '[]'::json) INTO v_chart FROM running_totals;

  RETURN json_build_object(
    'kpi', v_kpi,
    'chart', v_chart,
    'coach', v_coach_stats,
    'locality', v_locality_stats
  );
END;
$$;

-- Create an identical one for internal dashboard stats (coach and locality only)
CREATE OR REPLACE FUNCTION get_internal_extra_stats()
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_coach_stats json;
  v_locality_stats json;
BEGIN
  -- Coach stats
  SELECT json_build_object(
    'total', count(*),
    'online', count(*) FILTER (WHERE is_online = true),
    'offline', count(*) FILTER (WHERE is_online = false OR is_online IS NULL)
  ) INTO v_coach_stats
  FROM public.profiles
  WHERE role = 'applicant';

  -- Locality stats (Today)
  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_locality_stats
  FROM (
    SELECT 
      COALESCE(p.locality, 'Non renseigné') as locality,
      COUNT(r.id) as received,
      COUNT(r.id) FILTER (WHERE r.status = 'accepted') as accepted,
      COUNT(r.id) FILTER (WHERE r.status = 'rejected') as rejected,
      COUNT(r.id) FILTER (WHERE r.status = 'unchanged') as unchanged,
      COUNT(r.id) FILTER (WHERE r.status = 'other') as autres
    FROM public.verification_requests r
    JOIN public.profiles p ON r.applicant_id = p.id
    WHERE r.created_at >= current_date
    GROUP BY p.locality
    ORDER BY received DESC
  ) t;

  RETURN json_build_object(
    'coach', v_coach_stats,
    'locality', v_locality_stats
  );
END;
$$;
