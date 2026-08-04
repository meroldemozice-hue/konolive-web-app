CREATE OR REPLACE FUNCTION get_daily_performances(p_agent_id uuid DEFAULT NULL)
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
      EXTRACT(ISODOW FROM timezone('Africa/Brazzaville', created_at))::int AS d_idx,
      COUNT(id) AS cnt
    FROM public.verification_requests
    WHERE 
      status IN ('accepted', 'rejected', 'unchanged', 'other')
      AND timezone('Africa/Brazzaville', created_at)::date >= date_trunc('week', timezone('Africa/Brazzaville', now()))::date
      AND timezone('Africa/Brazzaville', created_at)::date < (date_trunc('week', timezone('Africa/Brazzaville', now()))::date + interval '7 days')
      AND (p_agent_id IS NULL OR agent_id = p_agent_id)
    GROUP BY EXTRACT(ISODOW FROM timezone('Africa/Brazzaville', created_at))
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
