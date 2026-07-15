CREATE TABLE IF NOT EXISTS a2a_inbox_turns (
  message_key text PRIMARY KEY,
  run_id text NOT NULL UNIQUE,
  session_key text NOT NULL,
  agent_id text NOT NULL,
  prompt text NOT NULL,
  status text NOT NULL CHECK (status IN ('received', 'model_started', 'tool_started', 'completed', 'failed', 'recovery_pending', 'recovering', 'replayed')),
  model_started boolean NOT NULL DEFAULT false,
  tool_started boolean NOT NULL DEFAULT false,
  recovery_attempts integer NOT NULL DEFAULT 0 CHECK (recovery_attempts >= 0),
  error text NULL,
  next_retry_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS a2a_inbox_turns_recovery_idx
  ON a2a_inbox_turns (status, next_retry_at, updated_at);
