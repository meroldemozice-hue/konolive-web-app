-- Revert internal cumulative chart to strictly use created_at cohort

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
    FROM public.verification_requests WHERE created_at >= current_date AND processing_started_at IS NOT NULL
    UNION ALL
    SELECT processed_at as t, 0, 0, -1, 
           CASE WHEN status='accepted' THEN 1 ELSE 0 END,
           CASE WHEN status='rejected' THEN 1 ELSE 0 END,
           CASE WHEN status='unchanged' THEN 1 ELSE 0 END,
           CASE WHEN status='other' THEN 1 ELSE 0 END
    FROM public.verification_requests WHERE created_at >= current_date AND processed_at IS NOT NULL AND status IN ('accepted','rejected','unchanged','other')
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

  RETURN v_chart;
END;
$$;