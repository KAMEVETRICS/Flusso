CREATE TABLE IF NOT EXISTS campaign_runs (
  id text PRIMARY KEY,
  brand text NOT NULL,
  goal text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  brief jsonb NOT NULL,
  delivery_pack jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_runs_created_at_idx
  ON campaign_runs (created_at DESC);
