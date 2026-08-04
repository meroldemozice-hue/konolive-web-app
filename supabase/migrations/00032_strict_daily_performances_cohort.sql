-- Revert daily performances to strictly use created_at as the daily cohort

CREATE OR REPLACE FUNCTION get_daily_performances()
RETURNS TABLE (day_name text, day_index int, value bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH week_days AS (
    SELECT 1 AS idx, 'Lundi' AS name UNION ALL
    SELECT 2, 'Mardi' UNION ALL
    SELECT 3, 'Mercredi' UNION ALL
    SELECT 4, 'Jeudi' UNION ALL
    SELECT 5, 'Vendredi' UNION ALL
    SELECT 6, 'Samedi' UNION ALL
    SELECT 7, 'Dimanche'
  ),
  daily_counts AS (
    SELECT 
      EXTRACT(ISODOW FROM created_at)::int AS d_idx,
      COUNT(id) AS cnt
    FROM public.verification_requests
    WHERE 
      status IN ('accepted', 'rejected', 'other')
      AND created_at >= date_trunc('week', timezone('utc', now()))
      AND created_at < date_trunc('week', timezone('utc', now())) + interval '7 days'
    GROUP BY EXTRACT(ISODOW FROM created_at)
  )
  SELECT 
    w.name,
    w.idx,
    COALESCE(c.cnt, 0)::bigint AS value
  FROM week_days w
  LEFT JOIN daily_counts c ON w.idx = c.d_idx
  ORDER BY w.idx ASC;
END;
$$;