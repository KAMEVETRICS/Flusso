/* global AbortSignal, fetch */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import process from "node:process";
import { URL } from "node:url";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import {
  canUseFlussoPrivateTool,
  findSubfloorOffer,
  floorFallback,
  isFlussoA2ATurn,
  parseNegotiationRound
} from "../../lib/openclaw-a2a-guard.mjs";
import { buildEngineRequest } from "../../lib/openclaw-engine-tool.mjs";
import {
  allowedMarketplaceActions,
  buildMarketplaceCommand,
  isDirectPeerChatMessage,
  marketplaceSessionForContext
} from "../../lib/openclaw-marketplace-tool.mjs";

const pluginId = "flusso-a2a-guard";
const runs = new Map();
const latestRunBySession = new Map();
const marketplacePlaybooks = new Map();
const marketplaceWrites = new Map();
const execFileAsync = promisify(execFile);
const MARKETPLACE_TOOL_ID = "flusso_marketplace";
const MARKETPLACE_PLAYBOOK_TTL_MS = 30 * 60 * 1_000;
const ONCHAINOS_BIN = process.env.ONCHAINOS_BIN?.trim() || "/home/flusso/.local/bin/onchainos";
const OKX_A2A_BIN = process.env.OKX_A2A_BIN?.trim() || "/home/flusso/.npm-global/bin/okx-a2a";

function marketplaceProviderId() {
  return process.env.FLUSSO_PROVIDER_AGENT_ID?.trim() || "5782";
}

function marketplaceSession(context) {
  return marketplaceSessionForContext({
    agentId: context.agentId,
    sessionKey: context.sessionKey,
    expectedProviderAgentId: marketplaceProviderId()
  });
}

function marketplacePlaybookKey(sessionKey, jobId) {
  return String(sessionKey) + ":" + jobId;
}

function marketplaceBinary(name) {
  if (name === "onchainos") return ONCHAINOS_BIN;
  if (name === "okx-a2a") return OKX_A2A_BIN;
  throw new Error("Unsupported marketplace binary.");
}

async function runMarketplaceCommand(command) {
  const home = process.env.HOME?.trim() || "/home/flusso";
  try {
    const result = await execFileAsync(marketplaceBinary(command.binary), command.args, {
      cwd: home,
      env: {
        ...process.env,
        HOME: home,
        OKX_AGENT_TASK_HOME: process.env.OKX_AGENT_TASK_HOME?.trim() || home + "/.okx-agent-task",
        PATH: [
          home + "/.npm-global/bin",
          home + "/.local/bin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin"
        ].join(":")
      },
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 120_000,
      windowsHide: true
    });
    const output = [result.stdout, result.stderr]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join("\n");
    return output || "Marketplace action completed successfully.";
  } catch (error) {
    const detail = [error?.stderr, error?.stdout, error?.message]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join("\n")
      .slice(0, 12_000);
    throw new Error("Marketplace action failed: " + (detail || "unknown error"));
  }
}

function advanceMarketplacePlaybook(key, action, allowed) {
  if (action === "asp_reject" && allowed.has("user_notify")) {
    marketplacePlaybooks.set(key, { allowed: new Set(["user_notify"]), createdAt: Date.now() });
    return;
  }
  if (action === "deliver" && allowed.has("peer_send")) {
    marketplacePlaybooks.set(key, { allowed: new Set(["peer_send"]), createdAt: Date.now() });
    return;
  }
  if (action === "dispute_raise" && allowed.has("dispute_confirm")) {
    marketplacePlaybooks.set(key, { allowed: new Set(["dispute_confirm"]), createdAt: Date.now() });
    return;
  }
  marketplacePlaybooks.delete(key);
}

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

const marketplaceToolParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: [
        "next_action",
        "apply",
        "asp_reject",
        "deliver",
        "agree_refund",
        "claim_auto_complete",
        "dispute_raise",
        "dispute_confirm",
        "user_notify",
        "peer_send"
      ]
    },
    jobId: { type: "string", description: "Marketplace job ID; it must match the active session." },
    messageJson: { type: "string", description: "Exact system-event message object for next_action." },
    tokenAmount: { type: "string", description: "Provider application price for apply." },
    tokenSymbol: { type: "string", enum: ["USDT", "USDG"] },
    reason: { type: "string", description: "Reason for a permitted rejection or dispute action." },
    content: { type: "string", description: "Delivery, peer message, or user notification content." }
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
    api.registerTool((toolContext) => {
      const session = marketplaceSession(toolContext);
      if (!session) return null;
      const sessionKey = String(toolContext.sessionKey);

      return {
        name: MARKETPLACE_TOOL_ID,
        label: "Flusso Marketplace",
        description: "Use this native adapter for every marketplace lifecycle command. Call next_action first with the exact system-event message JSON, then execute only the action prescribed by the returned playbook. Never use shell execution for marketplace commands.",
        parameters: marketplaceToolParameters,
        async execute(_id, params) {
          const floor = positiveNumber("A2A_PRICE_FLOOR_USDT", 30);
          const command = buildMarketplaceCommand(params, session, floor);
          const key = marketplacePlaybookKey(sessionKey, command.jobId);

          if (command.action === "next_action") {
            const output = await runMarketplaceCommand(command);
            const allowed = allowedMarketplaceActions(output);
            if (allowed.size === 0) {
              throw new Error("The marketplace playbook did not expose a supported provider action.");
            }
            marketplacePlaybooks.set(key, { allowed, createdAt: Date.now(), event: command.event });
            return {
              content: [{ type: "text", text: output }],
              details: { event: command.event, allowedActions: [...allowed] }
            };
          }

          const latestRunId = latestRunBySession.get(sessionKey);
          const currentRun = latestRunId ? runs.get(latestRunId) : null;
          const isDirectPeerReply = command.action === "peer_send"
            && isDirectPeerChatMessage(currentRun?.prompt, session);
          const playbook = marketplacePlaybooks.get(key);

          if (!isDirectPeerReply) {
            if (!playbook || Date.now() - playbook.createdAt > MARKETPLACE_PLAYBOOK_TTL_MS) {
              marketplacePlaybooks.delete(key);
              throw new Error("Call next_action for this event before executing a marketplace write.");
            }
            if (!playbook.allowed.has(command.action)) {
              throw new Error("The official marketplace playbook did not permit this action.");
            }
          }

          const writeKey = JSON.stringify([
            sessionKey,
            command.action,
            command.jobId,
            command.args,
            command.action === "peer_send" ? currentRun?.messageKey : null
          ]);
          if (marketplaceWrites.has(writeKey)) {
            if (command.action === "peer_send" && currentRun) currentRun.peerSent = true;
            return marketplaceWrites.get(writeKey);
          }

          const output = await runMarketplaceCommand(command);
          if (command.action === "apply" && !/txHash/i.test(output)) {
            throw new Error("Marketplace apply returned without a transaction hash.");
          }

          const result = {
            content: [{ type: "text", text: output }],
            details: { action: command.action, jobId: command.jobId }
          };
          marketplaceWrites.set(writeKey, result);
          if (command.action === "peer_send" && currentRun) currentRun.peerSent = true;
          if (playbook) advanceMarketplacePlaybook(key, command.action, playbook.allowed);
          return result;
        }
      };
    }, { name: MARKETPLACE_TOOL_ID });

    api.registerTool({
      name: "flusso_content_engine",
      label: "Flusso Content Engine",
      description: "Call Flusso's private Content Engineering engine. Use service_policy and quote during negotiation. Use create_job only after agreement, accept_job only for a matching OKX job_accepted event, then get_job, get_result, and get_export for fulfillment.",
      parameters: engineToolParameters,
      async execute(_id, params) {
        return callEngine(params);
      }
    });

    api.on("before_prompt_build", async (event, context) => {
      const session = marketplaceSession(context);
      if (!session) return;

      const runId = getRunId(event, context);
      const sessionKey = context.sessionKey;
      const prompt = String(event.prompt ?? "");
      if (
        runId
        && sessionKey
        && !runs.has(runId)
        && isFlussoA2ATurn({ agentId: context.agentId, sessionKey, prompt })
      ) {
        rememberRun({
          runId,
          sessionKey,
          agentId: context.agentId ?? "unknown",
          prompt,
          marketplaceSession: session,
          round: parseNegotiationRound(prompt),
          messageKey: createHash("sha256").update(`${sessionKey}\n${prompt}`).digest("hex")
        });
      }

      const floor = positiveNumber("A2A_PRICE_FLOOR_USDT", 30);
      return {
        prependSystemContext: [
          "This is a Flusso marketplace provider session.",
          "Use flusso_marketplace for every marketplace lifecycle command; never use exec or shell for onchainos or okx-a2a.",
          "For a system event, call flusso_marketplace with action next_action and the exact message object as messageJson, then follow only the returned playbook.",
          "For an a2a-agent-chat peer message, reply directly with flusso_marketplace action peer_send; next_action is only for system events.",
          "Use flusso_content_engine for pricing and fulfillment, but do not generate work before job_accepted.",
          "Flusso's hard application floor is " + floor + " USDT."
        ].join("\n")
      };
    }, { priority: 200 });

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
        marketplaceSession: marketplaceSession(context),
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
        event.toolName === MARKETPLACE_TOOL_ID
        && !marketplaceSession(context)
      ) {
        return { block: true, blockReason: "The marketplace adapter is restricted to Flusso provider sessions." };
      }


      if (
        event.toolName === "flusso_content_engine"
        && !canUseFlussoPrivateTool({
          agentId: context.agentId,
          sessionKey: context.sessionKey
        })
      ) {
        return { block: true, blockReason: "This private tool is restricted to the Flusso agent." };
      }

      const state = findRun(event, context);
      if (state) await persistEvent(api, state, "tool_started");
    }, { priority: 100 });

    api.on("before_agent_finalize", async (event, context) => {
      const state = findRun(event, context);
      if (!state) return;
      state.finalText = assistantText(event.lastAssistantMessage).trim();
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
      let failure = event.success ? null : errorText(event.error ?? assistantText(lastMessage));

      const session = state.marketplaceSession ?? marketplaceSession(context);
      const directReply = state.finalText || assistantText(lastMessage).trim();
      const isDirectPeerChat = isDirectPeerChatMessage(state.prompt, session);
      if (
        !failure
        && !state.peerSent
        && directReply
        && isDirectPeerChat
      ) {
        try {
          const command = buildMarketplaceCommand(
            { action: "peer_send", content: directReply },
            session,
            positiveNumber("A2A_PRICE_FLOOR_USDT", 30)
          );
          await runMarketplaceCommand(command);
          state.peerSent = true;
        } catch (sendError) {
          failure = errorText(sendError);
          api.logger.error(`${pluginId}: unable to relay direct peer reply: ${failure}`);
        }
      }

      await persistEvent(api, state, failure ? "failed" : "completed", failure);
    });
  }
});
