import { randomUUID } from "node:crypto";
import process from "node:process";
import { z } from "zod";
import { ensureCampaignSchema, getDatabase } from "./db";
import {
  GenerationStageSchema,
  ProjectBriefSchema,
  type GenerationStage,
  type ProjectBrief
} from "./schemas";

export const A2AJobStatusSchema = z.enum([
  "negotiated",
  "accepted",
  "running",
  "completed",
  "failed"
]);

export const A2AAgreementSchema = z.object({
  price: z.number().positive().max(10_000_000),
  currency: z.literal("USDT").default("USDT"),
  deadline: z.string().datetime(),
  acceptanceCriteria: z.array(z.string().trim().min(3).max(500)).min(1).max(12),
  revisionLimit: z.number().int().min(0).max(5).default(1)
});

export const CreateA2AJobSchema = z.object({
  okxJobId: z.string().trim().min(3).max(200),
  requesterAgentId: z.string().trim().min(1).max(200),
  brief: ProjectBriefSchema,
  agreement: A2AAgreementSchema
});

export const AcceptA2AJobSchema = z.object({
  event: z.literal("job_accepted"),
  okxJobId: z.string().trim().min(3).max(200)
});

export type A2AAgreement = z.infer<typeof A2AAgreementSchema>;
export type CreateA2AJobInput = z.infer<typeof CreateA2AJobSchema>;
export type A2AJobStatus = z.infer<typeof A2AJobStatusSchema>;

export type A2AContentJob = {
  id: string;
  okxJobId: string;
  requesterAgentId: string;
  status: A2AJobStatus;
  brief: ProjectBrief;
  agreement: A2AAgreement;
  currentStage: GenerationStage["stage"] | null;
  completedStages: GenerationStage[];
  campaignId: string | null;
  error: string | null;
  attemptCount: number;
  leaseExpiresAt: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

type A2AJobRow = {
  id: string;
  okx_job_id: string;
  requester_agent_id: string;
  status: A2AJobStatus;
  brief: unknown;
  agreement: unknown;
  current_stage: GenerationStage["stage"] | null;
  completed_stages: unknown;
  campaign_id: string | null;
  error: string | null;
  attempt_count: number;
  lease_expires_at: string | Date | null;
  next_retry_at: string | Date | null;
  created_at: string | Date;
  accepted_at: string | Date | null;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  updated_at: string | Date;
};

let schemaPromise: Promise<void> | null = null;

function positiveInteger(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(name + " must be a positive integer.");
  }
  return value;
}

export function getA2ARecoveryConfig() {
  return {
    maxAttempts: positiveInteger("A2A_MAX_GENERATION_ATTEMPTS", 3),
    leaseSeconds: positiveInteger("A2A_JOB_LEASE_SECONDS", 900),
    retryBaseSeconds: positiveInteger("A2A_RETRY_BASE_SECONDS", 60)
  };
}

export function getA2ARetryDelaySeconds(attemptCount: number, baseSeconds: number) {
  return Math.min(baseSeconds * (2 ** Math.max(attemptCount - 1, 0)), 900);
}

function parseJson<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function optionalIso(value: string | Date | null) {
  return value ? new Date(value).toISOString() : null;
}

function toJob(row: A2AJobRow): A2AContentJob {
  return {
    id: row.id,
    okxJobId: row.okx_job_id,
    requesterAgentId: row.requester_agent_id,
    status: A2AJobStatusSchema.parse(row.status),
    brief: ProjectBriefSchema.parse(parseJson(row.brief)),
    agreement: A2AAgreementSchema.parse(parseJson(row.agreement)),
    currentStage: row.current_stage,
    completedStages: z.array(GenerationStageSchema).parse(parseJson(row.completed_stages)),
    campaignId: row.campaign_id,
    error: row.error,
    attemptCount: row.attempt_count,
    leaseExpiresAt: optionalIso(row.lease_expires_at),
    nextRetryAt: optionalIso(row.next_retry_at),
    createdAt: new Date(row.created_at).toISOString(),
    acceptedAt: optionalIso(row.accepted_at),
    startedAt: optionalIso(row.started_at),
    completedAt: optionalIso(row.completed_at),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

async function ensureA2AJobSchema() {
  schemaPromise ??= (async () => {
    await ensureCampaignSchema();
    const sql = getDatabase();
    await sql`
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
        attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        lease_expires_at timestamptz NULL,
        next_retry_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        accepted_at timestamptz NULL,
        started_at timestamptz NULL,
        completed_at timestamptz NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      ALTER TABLE a2a_content_jobs
      ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0
    `;
    await sql`
      ALTER TABLE a2a_content_jobs
      ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz NULL
    `;
    await sql`
      ALTER TABLE a2a_content_jobs
      ADD COLUMN IF NOT EXISTS next_retry_at timestamptz NULL
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS a2a_content_jobs_status_idx
      ON a2a_content_jobs (status, updated_at DESC)
    `;
  })();

  return schemaPromise;
}

export async function createA2AJob(input: CreateA2AJobInput) {
  await ensureA2AJobSchema();
  const sql = getDatabase();
  const id = randomUUID();
  const briefJson = JSON.stringify(input.brief);
  const agreementJson = JSON.stringify(input.agreement);
  const inserted = await sql`
    INSERT INTO a2a_content_jobs (
      id, okx_job_id, requester_agent_id, status, brief, agreement
    ) VALUES (
      ${id}, ${input.okxJobId}, ${input.requesterAgentId}, 'negotiated',
      ${briefJson}::jsonb, ${agreementJson}::jsonb
    )
    ON CONFLICT (okx_job_id) DO NOTHING
    RETURNING *
  ` as A2AJobRow[];

  if (inserted[0]) return { job: toJob(inserted[0]), created: true };

  const existing = await getA2AJobByOkxId(input.okxJobId);
  if (!existing) throw new Error("A2A job conflict returned no database row.");
  return { job: existing, created: false };
}

export async function getA2AJob(id: string) {
  await ensureA2AJobSchema();
  const sql = getDatabase();
  const rows = await sql`
    SELECT *
    FROM a2a_content_jobs
    WHERE id = ${id}
    LIMIT 1
  ` as A2AJobRow[];
  return rows[0] ? toJob(rows[0]) : null;
}

export async function getA2AJobByOkxId(okxJobId: string) {
  await ensureA2AJobSchema();
  const sql = getDatabase();
  const rows = await sql`
    SELECT *
    FROM a2a_content_jobs
    WHERE okx_job_id = ${okxJobId}
    LIMIT 1
  ` as A2AJobRow[];
  return rows[0] ? toJob(rows[0]) : null;
}

async function releaseExpiredA2ALeases(
  sql: ReturnType<typeof getDatabase>,
  maxAttempts: number
) {
  await sql`
    UPDATE a2a_content_jobs
    SET
      status = CASE WHEN attempt_count >= ${maxAttempts} THEN 'failed' ELSE 'accepted' END,
      error = COALESCE(error, 'Generation lease expired and was recovered.'),
      lease_expires_at = NULL,
      next_retry_at = CASE WHEN attempt_count >= ${maxAttempts} THEN NULL ELSE now() END,
      completed_at = CASE WHEN attempt_count >= ${maxAttempts} THEN now() ELSE NULL END,
      updated_at = now()
    WHERE status = 'running'
      AND (lease_expires_at IS NULL OR lease_expires_at <= now())
  `;

  await sql`
    UPDATE a2a_content_jobs
    SET
      status = 'failed',
      error = COALESCE(error, 'Generation attempts exhausted.'),
      next_retry_at = NULL,
      completed_at = now(),
      updated_at = now()
    WHERE status = 'accepted' AND attempt_count >= ${maxAttempts}
  `;
}

export async function findRecoverableA2AJobIds(limit = 5) {
  await ensureA2AJobSchema();
  const sql = getDatabase();
  const { maxAttempts } = getA2ARecoveryConfig();
  const safeLimit = Math.max(1, Math.min(limit, 20));
  await releaseExpiredA2ALeases(sql, maxAttempts);

  const rows = await sql`
    SELECT id
    FROM a2a_content_jobs
    WHERE status = 'accepted'
      AND attempt_count < ${maxAttempts}
      AND (next_retry_at IS NULL OR next_retry_at <= now())
    ORDER BY COALESCE(next_retry_at, accepted_at, created_at) ASC
    LIMIT ${safeLimit}
  ` as { id: string }[];
  return rows.map((row) => row.id);
}

export async function acceptA2AJob(id: string, okxJobId: string) {
  await ensureA2AJobSchema();
  const sql = getDatabase();
  const rows = await sql`
    UPDATE a2a_content_jobs
    SET
      status = 'accepted',
      accepted_at = COALESCE(accepted_at, now()),
      error = NULL,
      next_retry_at = NULL,
      updated_at = now()
    WHERE id = ${id}
      AND okx_job_id = ${okxJobId}
      AND status = 'negotiated'
    RETURNING *
  ` as A2AJobRow[];

  if (rows[0]) return toJob(rows[0]);
  return getA2AJob(id);
}

export async function claimAcceptedA2AJob(id: string) {
  await ensureA2AJobSchema();
  const sql = getDatabase();
  const { leaseSeconds, maxAttempts } = getA2ARecoveryConfig();
  const rows = await sql`
    UPDATE a2a_content_jobs
    SET
      status = 'running',
      attempt_count = attempt_count + 1,
      lease_expires_at = now() + (${leaseSeconds} * interval '1 second'),
      next_retry_at = NULL,
      started_at = now(),
      completed_at = NULL,
      current_stage = NULL,
      completed_stages = '[]'::jsonb,
      error = NULL,
      updated_at = now()
    WHERE id = ${id}
      AND status = 'accepted'
      AND attempt_count < ${maxAttempts}
      AND (next_retry_at IS NULL OR next_retry_at <= now())
    RETURNING *
  ` as A2AJobRow[];
  return rows[0] ? toJob(rows[0]) : null;
}

export async function recordA2AJobStage(id: string, stage: GenerationStage) {
  await ensureA2AJobSchema();
  const sql = getDatabase();
  const { leaseSeconds } = getA2ARecoveryConfig();
  const stageJson = JSON.stringify([stage]);
  await sql`
    UPDATE a2a_content_jobs
    SET
      current_stage = ${stage.stage},
      completed_stages = completed_stages || ${stageJson}::jsonb,
      lease_expires_at = now() + (${leaseSeconds} * interval '1 second'),
      updated_at = now()
    WHERE id = ${id} AND status = 'running'
  `;
}

export async function completeA2AJob(id: string, campaignId: string) {
  await ensureA2AJobSchema();
  const sql = getDatabase();
  await sql`
    UPDATE a2a_content_jobs
    SET
      status = 'completed',
      campaign_id = ${campaignId},
      current_stage = NULL,
      lease_expires_at = NULL,
      next_retry_at = NULL,
      completed_at = now(),
      updated_at = now()
    WHERE id = ${id} AND status = 'running'
  `;
}

export async function deferOrFailA2AJob(
  id: string,
  message: string,
  attemptCount: number
) {
  await ensureA2AJobSchema();
  const sql = getDatabase();
  const { maxAttempts, retryBaseSeconds } = getA2ARecoveryConfig();
  const error = message.slice(0, 4000);

  if (attemptCount < maxAttempts) {
    const retryDelay = getA2ARetryDelaySeconds(attemptCount, retryBaseSeconds);
    await sql`
      UPDATE a2a_content_jobs
      SET
        status = 'accepted',
        error = ${error},
        current_stage = NULL,
        lease_expires_at = NULL,
        next_retry_at = now() + (${retryDelay} * interval '1 second'),
        updated_at = now()
      WHERE id = ${id} AND status = 'running'
    `;
    return;
  }

  await sql`
    UPDATE a2a_content_jobs
    SET
      status = 'failed',
      error = ${error},
      current_stage = NULL,
      lease_expires_at = NULL,
      next_retry_at = NULL,
      completed_at = now(),
      updated_at = now()
    WHERE id = ${id} AND status = 'running'
  `;
}
