-- Drop the old function to be safe if signatures change
DROP FUNCTION IF EXISTS public.get_public_dashboard_data(uuid);

-- Recreate it with cumulative minute-level chart logic
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
    'received', received,
    'pending', pending,
    'processing', processing,
    'accepted', accepted,
    'rejected', rejected,
    'unchanged', unchanged,
    'autres', autres,
    'avgTime', 0
  )), '[]'::json) INTO v_chart FROM running_totals;

  RETURN json_build_object(
    'kpi', v_kpi,
    'chart', v_chart
  );
END;
$$;

-- Create an identical one for internal dashboard (no link required)
CREATE OR REPLACE FUNCTION get_internal_cumulative_chart()
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_chart json;
BEGIN
  -- We only return the chart part here, the KPI is fetched by api.ts
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
    'received', received,
    'pending', pending,
    'processing', processing,
    'accepted', accepted,
    'rejected', rejected,
    'unchanged', unchanged,
    'autres', autres,
    'avgTime', 0
  )), '[]'::json) INTO v_chart FROM running_totals;

  RETURN v_chart;
END;
$$;
