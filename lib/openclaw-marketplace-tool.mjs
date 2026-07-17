import { URLSearchParams } from "node:url";

const JOB_ID_PATTERN = /^0x[0-9a-f]{64}$/i;
const AGENT_ID_PATTERN = /^\d+$/;
const EVENT_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;
const TOKEN_SYMBOLS = new Set(["USDT", "USDG"]);
const PROVIDER_AGENTS = new Set(["main", "flusso"]);

const playbookPatterns = new Map([
  ["apply", /\bonchainos agent apply\b/],
  ["asp_reject", /\bonchainos agent asp-reject\b/],
  ["deliver", /\bonchainos agent deliver\b/],
  ["agree_refund", /\bonchainos agent agree-refund\b/],
  ["claim_auto_complete", /\bonchainos agent claim-auto-complete\b/],
  ["dispute_raise", /\bonchainos agent dispute raise\b/],
  ["dispute_confirm", /\bonchainos agent dispute confirm\b/],
  ["user_notify", /\bonchainos agent user-notify\b/],
  ["peer_send", /\bokx-a2a xmtp-send\b/]
]);

function requiredString(value, name, maxLength) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(name + " is required.");
  if (normalized.length > maxLength) throw new Error(name + " is too long.");
  return normalized;
}

function requiredJobId(value) {
  const normalized = requiredString(value, "jobId", 66);
  if (!JOB_ID_PATTERN.test(normalized)) throw new Error("jobId must be a 32-byte hex task ID.");
  return normalized.toLowerCase();
}

function requiredAgentId(value, name) {
  const normalized = requiredString(value, name, 20);
  if (!AGENT_ID_PATTERN.test(normalized)) throw new Error(name + " must be numeric.");
  return normalized;
}

function requiredAmount(value, floor) {
  const normalized = requiredString(value, "tokenAmount", 32);
  if (!/^\d+(?:\.\d{1,5})?$/.test(normalized)) {
    throw new Error("tokenAmount must be a positive decimal with at most five decimal places.");
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
    throw new Error("tokenAmount is outside the supported range.");
  }
  if (amount < floor) throw new Error("Flusso cannot apply below its " + floor + " USDT floor.");
  return normalized;
}

function requiredTokenSymbol(value) {
  const normalized = requiredString(value, "tokenSymbol", 8).toUpperCase();
  if (!TOKEN_SYMBOLS.has(normalized)) throw new Error("tokenSymbol must be USDT or USDG.");
  return normalized;
}

function eventMessage(value, session) {
  const raw = requiredString(value, "messageJson", 50_000);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("messageJson must contain valid JSON.");
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("messageJson must encode an object.");
  }

  const event = requiredString(parsed.event, "message.event", 80);
  if (!EVENT_PATTERN.test(event)) throw new Error("message.event is invalid.");
  const jobId = requiredJobId(parsed.jobId);
  if (jobId !== session.jobId) throw new Error("The event job does not match this marketplace session.");
  if (parsed.source !== undefined && parsed.source !== "system") {
    throw new Error("Only marketplace system events can enter the native adapter.");
  }
  if (
    parsed.providerAgentId !== undefined
    && requiredAgentId(parsed.providerAgentId, "message.providerAgentId") !== session.providerAgentId
  ) {
    throw new Error("The event provider does not match this marketplace session.");
  }

  return { event, jobId, json: JSON.stringify(parsed) };
}

export function parseMarketplaceSession(sessionKey) {
  const key = String(sessionKey ?? "");
  const marker = ":okx-a2a:group:okx-xmtp:";
  const markerIndex = key.indexOf(marker);
  if (markerIndex < 0) return null;

  const params = new URLSearchParams(key.slice(markerIndex + marker.length));
  const providerAgentId = params.get("my");
  const counterpartyAgentId = params.get("to");
  const jobId = params.get("job");
  if (
    !providerAgentId
    || !counterpartyAgentId
    || !jobId
    || !AGENT_ID_PATTERN.test(providerAgentId)
    || !AGENT_ID_PATTERN.test(counterpartyAgentId)
    || !JOB_ID_PATTERN.test(jobId)
  ) return null;

  return {
    providerAgentId,
    counterpartyAgentId,
    jobId: jobId.toLowerCase()
  };
}

export function marketplaceSessionForContext({ agentId, sessionKey, expectedProviderAgentId }) {
  if (!PROVIDER_AGENTS.has(String(agentId ?? "").toLowerCase())) return null;
  const session = parseMarketplaceSession(sessionKey);
  if (!session) return null;

  const expected = String(expectedProviderAgentId ?? "").trim();
  if (expected && session.providerAgentId !== expected) return null;
  return session;
}

export function allowedMarketplaceActions(playbook) {
  const text = String(playbook ?? "");
  return new Set(
    [...playbookPatterns]
      .filter(([, pattern]) => pattern.test(text))
      .map(([action]) => action)
  );
}

export function buildMarketplaceCommand(input, session, floor = 30) {
  if (!session) throw new Error("A trusted marketplace session is required.");
  const action = requiredString(input.action, "action", 40);
  const jobId = input.jobId === undefined ? session.jobId : requiredJobId(input.jobId);
  if (jobId !== session.jobId) throw new Error("The requested job does not match this marketplace session.");

  switch (action) {
    case "next_action": {
      const message = eventMessage(input.messageJson, session);
      return {
        binary: "onchainos",
        action,
        event: message.event,
        jobId,
        args: ["agent", "next-action", "--role", "auto", "--agentId", session.providerAgentId, "--message", message.json]
      };
    }
    case "apply":
      return {
        binary: "onchainos",
        action,
        jobId,
        args: [
          "agent", "apply", jobId,
          "--agent-id", session.providerAgentId,
          "--token-amount", requiredAmount(input.tokenAmount, floor),
          "--token-symbol", requiredTokenSymbol(input.tokenSymbol)
        ]
      };
    case "asp_reject":
      if (input.reason !== "capability mismatch") {
        throw new Error("ASP rejection is restricted to a capability mismatch.");
      }
      return {
        binary: "onchainos",
        action,
        jobId,
        args: ["agent", "asp-reject", jobId, "--agent-id", session.providerAgentId, "--reason", input.reason]
      };
    case "deliver":
      return {
        binary: "onchainos",
        action,
        jobId,
        args: [
          "agent", "deliver", jobId,
          "--message", requiredString(input.content, "content", 20_000),
          "--agent-id", session.providerAgentId
        ]
      };
    case "agree_refund":
      return {
        binary: "onchainos",
        action,
        jobId,
        args: ["agent", "agree-refund", jobId, "--agent-id", session.providerAgentId]
      };
    case "claim_auto_complete":
      return {
        binary: "onchainos",
        action,
        jobId,
        args: ["agent", "claim-auto-complete", jobId, "--agent-id", session.providerAgentId]
      };
    case "dispute_raise":
      return {
        binary: "onchainos",
        action,
        jobId,
        args: [
          "agent", "dispute", "raise", jobId,
          "--reason", requiredString(input.reason, "reason", 1_000),
          "--agent-id", session.providerAgentId
        ]
      };
    case "dispute_confirm":
      return {
        binary: "onchainos",
        action,
        jobId,
        args: ["agent", "dispute", "confirm", jobId, "--agent-id", session.providerAgentId]
      };
    case "user_notify":
      return {
        binary: "onchainos",
        action,
        jobId,
        args: ["agent", "user-notify", "--content", requiredString(input.content, "content", 4_000)]
      };
    case "peer_send":
      return {
        binary: "okx-a2a",
        action,
        jobId,
        args: [
          "xmtp-send",
          "--job-id", jobId,
          "--to-agent-id", session.counterpartyAgentId,
          "--message", requiredString(input.content, "content", 20_000)
        ]
      };
    default:
      throw new Error("Unsupported marketplace action.");
  }
}
