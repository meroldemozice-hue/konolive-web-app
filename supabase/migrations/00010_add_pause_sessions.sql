
-- Track pause sessions per agent
CREATE TABLE IF NOT EXISTS pause_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NOT NULL THEN EXTRACT(EPOCH FROM (ended_at - started_at))::integer END
  ) STORED
);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS total_pause_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_pause_seconds integer NOT NULL DEFAULT 0;

-- RLS
ALTER TABLE pause_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents manage own pause sessions"
  ON pause_sessions FOR ALL
  USING (auth.uid() = agent_id)
  WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Supervisors read pause sessions"
  ON pause_sessions FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('supervisor', 'admin')));
