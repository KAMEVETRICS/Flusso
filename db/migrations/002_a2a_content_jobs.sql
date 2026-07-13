CREATE TABLE IF NOT EXISTS a2a_content_jobs (
  id text PRIMARY KEY,
  okx_job_id text NOT NULL UNIQUE,
  requester_agent_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('negotiated', 'accepted', 'running', 'completed', 'failed')),
  brief jsonb NOT NULL,
  agreement jsonb NOT NULL,
  current_stage text NULL,
  completed_stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  campaign_id text NULL REFERENCES campaign_runs(id) ON DELETE SET NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS a2a_content_jobs_status_idx
  ON a2a_content_jobs (status, updated_at DESC);