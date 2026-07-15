import process from "node:process";
import { z } from "zod";
import { isRetiredBindingError } from "./a2a-recovery-policy";
import { getDatabase } from "./db";

export const A2AInboxEventSchema = z.object({
  event: z.enum(["received", "model_started", "tool_started", "completed", "failed"]),
  messageKey: z.string().regex(/^[a-f0-9]{64}$/),
  runId: z.string().trim().min(1).max(300),
  sessionKey: z.string().trim().min(1).max(500),
  agentId: z.string().trim().min(1).max(200),
  prompt: z.string().min(1).max(250_000),
  error: z.string().max(4_000).nullable().optional()
});

export const A2AInboxRecoveryReportSchema = z.object({
  messageKey: z.string().regex(/^[a-f0-9]{64}$/),
  runId: z.string().trim().min(1).max(300),
  success: z.boolean(),
  error: z.string().max(4_000).optional()
});

export type A2AInboxEvent = z.infer<typeof A2AInboxEventSchema>;
export type A2AInboxRecoveryReport = z.infer<typeof A2AInboxRecoveryReportSchema>;

type InboxRow = {
  message_key: string;
  run_id: string;
  session_key: string;
  prompt: string;
  recovery_attempts: number;
};

let schemaPromise: Promise<void> | null = null;

function positiveInteger(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

export function getA2AInboxRecoveryConfig() {
  return {
    maxAttempts: positiveInteger("A2A_MAX_CONVERSATION_RECOVERY_ATTEMPTS", 2),
    retryBaseSeconds: positiveInteger("A2A_CONVERSATION_RETRY_BASE_SECONDS", 30)
  };
}


async function ensureA2AInboxSchema() {
  schemaPromise ??= (async () => {
    const sql = getDatabase();
    await sql`
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
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS a2a_inbox_turns_recovery_idx
      ON a2a_inbox_turns (status, next_retry_at, updated_at)
    `;
  })();
  return schemaPromise;
}

export async function recordA2AInboxEvent(input: A2AInboxEvent) {
  await ensureA2AInboxSchema();
  const sql = getDatabase();

  if (input.event === "received") {
    await sql`
      INSERT INTO a2a_inbox_turns (
        message_key, run_id, session_key, agent_id, prompt, status
      ) VALUES (
        ${input.messageKey}, ${input.runId}, ${input.sessionKey}, ${input.agentId}, ${input.prompt}, 'received'
      )
      ON CONFLICT (message_key) DO UPDATE SET
        run_id = EXCLUDED.run_id,
        session_key = EXCLUDED.session_key,
        agent_id = EXCLUDED.agent_id,
        prompt = EXCLUDED.prompt,
        status = 'received',
        model_started = false,
        tool_started = false,
        error = NULL,
        next_retry_at = NULL,
        completed_at = NULL,
        recovery_attempts = CASE
          WHEN a2a_inbox_turns.status = 'completed' THEN 0
          ELSE a2a_inbox_turns.recovery_attempts
        END,
        updated_at = now()
    `;
    return;
  }

  if (input.event === "model_started") {
    await sql`
      UPDATE a2a_inbox_turns
      SET status = 'model_started', model_started = true, updated_at = now()
      WHERE run_id = ${input.runId}
    `;
    return;
  }

  if (input.event === "tool_started") {
    await sql`
      UPDATE a2a_inbox_turns
      SET status = 'tool_started', tool_started = true, updated_at = now()
      WHERE run_id = ${input.runId}
    `;
    return;
  }

  if (input.event === "completed") {
    await sql`
      UPDATE a2a_inbox_turns
      SET status = 'completed', error = NULL, next_retry_at = NULL,
          recovery_attempts = 0, completed_at = now(), updated_at = now()
      WHERE run_id = ${input.runId}
    `;
    return;
  }

  const { maxAttempts } = getA2AInboxRecoveryConfig();
  const error = input.error ?? "Agent run failed without an error message.";
  const retryable = isRetiredBindingError(error);
  await sql`
    UPDATE a2a_inbox_turns
    SET
      status = CASE
        WHEN ${retryable} AND NOT model_started AND NOT tool_started AND recovery_attempts < ${maxAttempts}
          THEN 'recovery_pending'
        ELSE 'failed'
      END,
      error = ${error},
      next_retry_at = CASE
        WHEN ${retryable} AND NOT model_started AND NOT tool_started AND recovery_attempts < ${maxAttempts}
          THEN now()
        ELSE NULL
      END,
      completed_at = CASE
        WHEN ${retryable} AND NOT model_started AND NOT tool_started AND recovery_attempts < ${maxAttempts}
          THEN NULL
        ELSE now()
      END,
      updated_at = now()
    WHERE run_id = ${input.runId}
  `;
}

export async function claimRecoverableA2AInboxTurns(limit = 3) {
  await ensureA2AInboxSchema();
  const sql = getDatabase();
  const { maxAttempts } = getA2AInboxRecoveryConfig();
  const safeLimit = Math.max(1, Math.min(limit, 10));

  await sql`
    UPDATE a2a_inbox_turns
    SET
      status = CASE WHEN recovery_attempts < ${maxAttempts} THEN 'recovery_pending' ELSE 'failed' END,
      error = COALESCE(error, 'Conversation recovery lease expired.'),
      next_retry_at = CASE WHEN recovery_attempts < ${maxAttempts} THEN now() ELSE NULL END,
      completed_at = CASE WHEN recovery_attempts < ${maxAttempts} THEN NULL ELSE now() END,
      updated_at = now()
    WHERE status = 'recovering'
      AND updated_at <= now() - interval '5 minutes'
  `;

  const rows = await sql`
    WITH ranked AS (
      SELECT
        message_key,
        row_number() OVER (PARTITION BY session_key ORDER BY updated_at ASC) AS session_rank
      FROM a2a_inbox_turns
      WHERE status = 'recovery_pending'
        AND recovery_attempts < ${maxAttempts}
        AND (next_retry_at IS NULL OR next_retry_at <= now())
    ), selected AS (
      SELECT message_key
      FROM ranked
      WHERE session_rank = 1
      LIMIT ${safeLimit}
    )
    UPDATE a2a_inbox_turns AS turn
    SET status = 'recovering', recovery_attempts = recovery_attempts + 1, updated_at = now()
    FROM selected
    WHERE turn.message_key = selected.message_key
      AND turn.status = 'recovery_pending'
    RETURNING turn.message_key, turn.run_id, turn.session_key, turn.prompt, turn.recovery_attempts
  ` as InboxRow[];

  return rows.map((row) => ({
    messageKey: row.message_key,
    runId: row.run_id,
    sessionKey: row.session_key,
    prompt: row.prompt,
    recoveryAttempts: row.recovery_attempts
  }));
}

export async function reportA2AInboxRecovery(input: A2AInboxRecoveryReport) {
  await ensureA2AInboxSchema();
  const sql = getDatabase();
  const { maxAttempts, retryBaseSeconds } = getA2AInboxRecoveryConfig();

  if (input.success) {
    await sql`
      UPDATE a2a_inbox_turns
      SET status = 'replayed', error = NULL, next_retry_at = NULL, updated_at = now()
      WHERE message_key = ${input.messageKey}
        AND run_id = ${input.runId}
        AND status = 'recovering'
    `;
    return;
  }

  const error = input.error ?? "Conversation replay failed without an error message.";
  await sql`
    UPDATE a2a_inbox_turns
    SET
      status = CASE WHEN recovery_attempts < ${maxAttempts} THEN 'recovery_pending' ELSE 'failed' END,
      error = ${error},
      next_retry_at = CASE
        WHEN recovery_attempts < ${maxAttempts}
          THEN now() + (
            LEAST(900, ${retryBaseSeconds} * power(2, GREATEST(recovery_attempts - 1, 0)))
            * interval '1 second'
          )
        ELSE NULL
      END,
      completed_at = CASE WHEN recovery_attempts < ${maxAttempts} THEN NULL ELSE now() END,
      updated_at = now()
    WHERE message_key = ${input.messageKey}
      AND run_id = ${input.runId}
      AND status = 'recovering'
  `;
}
