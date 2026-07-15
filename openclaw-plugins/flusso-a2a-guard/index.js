/* global AbortSignal, fetch */
import { createHash } from "node:crypto";
import process from "node:process";
import { URL } from "node:url";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import {
  findSubfloorOffer,
  floorFallback,
  isFlussoA2ATurn,
  parseNegotiationRound
} from "../../lib/openclaw-a2a-guard.mjs";
import { buildEngineRequest } from "../../lib/openclaw-engine-tool.mjs";

const pluginId = "flusso-a2a-guard";
const runs = new Map();
const latestRunBySession = new Map();

function positiveNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getRunId(event, context) {
  return event.runId ?? context.runId ?? null;
}

function assistantText(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.content === "string") return value.content;
  if (value && Array.isArray(value.content)) {
    return value.content
      .map((part) => typeof part === "string" ? part : part?.text ?? "")
      .join("\n");
  }
  return "";
}

function errorText(value) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (value && typeof value.message === "string") return value.message;
  return value ? String(value) : "Agent run failed without an error message.";
}

function rememberRun(state) {
  runs.set(state.runId, state);
  latestRunBySession.set(state.sessionKey, state.runId);
  if (runs.size <= 1_000) return;
  const oldest = runs.keys().next().value;
  runs.delete(oldest);
}

function findRun(event, context) {
  const runId = getRunId(event, context);
  if (runId && runs.has(runId)) return runs.get(runId);
  const latestRun = context.sessionKey ? latestRunBySession.get(context.sessionKey) : null;
  return latestRun ? runs.get(latestRun) : null;
}

async function persistEvent(api, state, event, error = null) {
  const baseUrl = process.env.CONTENT_ENGINE_URL?.trim();
  const apiKey = process.env.A2A_INTERNAL_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    api.logger.error(`${pluginId}: CONTENT_ENGINE_URL or A2A_INTERNAL_API_KEY is missing.`);
    return false;
  }

  try {
    const response = await fetch(new URL("/api/internal/a2a/inbox/events", baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        event,
        messageKey: state.messageKey,
        runId: state.runId,
        sessionKey: state.sessionKey,
        agentId: state.agentId,
        prompt: state.prompt,
        error
      }),
      signal: AbortSignal.timeout(3_000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return true;
  } catch (persistError) {
    api.logger.error(`${pluginId}: unable to persist ${event}: ${errorText(persistError)}`);
    return false;
  }
}

const engineToolParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: [
        "service_policy",
        "quote",
        "create_job",
        "accept_job",
        "get_job",
        "get_result",
        "get_export"
      ]
    },
    jobId: { type: "string", description: "Internal Flusso job ID for job operations." },
    format: {
      type: "string",
      enum: ["strategy", "calendar", "content-pack"],
      description: "Export format for get_export."
    },
    payloadJson: {
      type: "string",
      description: "JSON object body for quote, create_job, or accept_job."
    }
  },
  required: ["action"]
};

async function callEngine(params) {
  const baseUrl = process.env.CONTENT_ENGINE_URL?.trim();
  const apiKey = process.env.A2A_INTERNAL_API_KEY?.trim();
  if (!baseUrl || !apiKey) throw new Error("The private Flusso engine is not configured.");

  const request = buildEngineRequest(params);
  const response = await fetch(new URL(request.path, baseUrl), {
    method: request.method,
    headers: {
      Authorization: "Bearer " + apiKey,
      ...(request.body ? { "Content-Type": "application/json" } : {})
    },
    body: request.body ? JSON.stringify(request.body) : undefined,
    signal: AbortSignal.timeout(120_000)
  });
  const contentType = response.headers.get("content-type") ?? "text/plain";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail = data && typeof data === "object" && "error" in data
      ? String(data.error)
      : "Request failed.";
    throw new Error("Flusso content engine returned HTTP " + response.status + ": " + detail);
  }

  return {
    content: [{
      type: "text",
      text: typeof data === "string" ? data : JSON.stringify(data, null, 2)
    }],
    details: {
      status: response.status,
      contentType,
      disposition: response.headers.get("content-disposition")
    }
  };
}

export default definePluginEntry({
  id: pluginId,
  name: "Flusso A2A Guard",
  description: "Durable A2A turn recovery and private content-engine access for Flusso.",
  register(api) {
    api.registerTool({
      name: "flusso_content_engine",
      label: "Flusso Content Engine",
      description: "Call Flusso's private Content Engineering engine. Use service_policy and quote during negotiation. Use create_job only after agreement, accept_job only for a matching OKX job_accepted event, then get_job, get_result, and get_export for fulfillment.",
      parameters: engineToolParameters,
      async execute(_id, params) {
        return callEngine(params);
      }
    });

    api.on("before_agent_run", async (event, context) => {
      const runId = getRunId(event, context);
      const sessionKey = context.sessionKey;
      const agentId = context.agentId ?? "unknown";
      if (!runId || !sessionKey || !isFlussoA2ATurn({ agentId, sessionKey, prompt: event.prompt })) return;

      const prompt = String(event.prompt ?? "");
      const state = {
        runId,
        sessionKey,
        agentId,
        prompt,
        round: parseNegotiationRound(prompt),
        messageKey: createHash("sha256").update(`${sessionKey}\n${prompt}`).digest("hex")
      };
      rememberRun(state);
      await persistEvent(api, state, "received");
    }, { priority: 100 });

    api.on("model_call_started", async (event, context) => {
      const state = findRun(event, context);
      if (state) await persistEvent(api, state, "model_started");
    });

    api.on("before_tool_call", async (event, context) => {
      if (
        event.toolName === "flusso_content_engine"
        && String(context.agentId ?? "").toLowerCase() !== "flusso"
      ) {
        return { block: true, blockReason: "This private tool is restricted to the Flusso agent." };
      }

      const state = findRun(event, context);
      if (state) await persistEvent(api, state, "tool_started");
    }, { priority: 100 });

    api.on("before_agent_finalize", async (event, context) => {
      const state = findRun(event, context);
      if (!state) return;
      const floor = positiveNumber("A2A_PRICE_FLOOR_USDT", 30);
      const violation = findSubfloorOffer(assistantText(event.lastAssistantMessage), floor);
      if (!violation) return;

      return {
        action: "revise",
        reason: `The draft offers work at ${violation.amount} USDT, below Flusso's hard ${floor} USDT floor.`,
        retry: {
          instruction: state.round >= 2
            ? `Decline the below-floor budget. State that ${floor} USDT is the minimum and do not offer any deliverable below it.`
            : `Counter at exactly ${floor} USDT with reduced credible scope. Do not offer any deliverable at the client's lower budget.`,
          idempotencyKey: `flusso-floor:${state.messageKey}`,
          maxAttempts: 1
        }
      };
    }, { priority: 100 });

    api.on("message_sending", async (event, context) => {
      const state = findRun(event, context);
      if (!state || typeof event.content !== "string") return;
      const floor = positiveNumber("A2A_PRICE_FLOOR_USDT", 30);
      if (!findSubfloorOffer(event.content, floor)) return;
      api.logger.error(`${pluginId}: replaced an outbound below-floor offer for run ${state.runId}.`);
      return { content: floorFallback(floor, state.round) };
    }, { priority: 100 });

    api.on("agent_end", async (event, context) => {
      const state = findRun(event, context);
      if (!state) return;
      const lastMessage = Array.isArray(event.messages) ? event.messages.at(-1) : null;
      const failure = event.success ? null : errorText(event.error ?? assistantText(lastMessage));
      await persistEvent(api, state, event.success ? "completed" : "failed", failure);
    });
  }
});
