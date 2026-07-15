/* global AbortSignal, console, fetch */
import { spawnSync } from "node:child_process";
import process from "node:process";
import { URL } from "node:url";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw Error(name + " is required.");
  return value;
}

const baseUrl = required("CONTENT_ENGINE_URL");
const apiKey = required("A2A_INTERNAL_API_KEY");
const endpoint = new URL("/api/internal/a2a/inbox/events", baseUrl);

async function request(method, body) {
  const response = await fetch(endpoint, {
    method,
    headers: {
      Authorization: "Bearer " + apiKey,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000)
  });
  const payload = await response.json();
  if (!response.ok) throw Error(`A2A inbox returned HTTP ${response.status}: ${payload.error ?? "unknown error"}`);
  return payload;
}

function gatewayCall(method, params) {
  const result = spawnSync(
    "openclaw",
    ["gateway", "call", method, "--params", JSON.stringify(params)],
    { encoding: "utf8", timeout: 60_000, windowsHide: true }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error((result.stderr || result.stdout || `${method} failed`).trim());
}

const { turns } = await request("PUT");
const results = [];

for (const turn of turns) {
  try {
    gatewayCall("sessions.reset", { key: turn.sessionKey });
    gatewayCall("chat.send", {
      sessionKey: turn.sessionKey,
      message: turn.prompt,
      deliver: true,
      idempotencyKey: `flusso-recovery:${turn.messageKey}`
    });
    await request("PATCH", {
      messageKey: turn.messageKey,
      runId: turn.runId,
      success: true
    });
    results.push({ messageKey: turn.messageKey, status: "replayed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await request("PATCH", {
      messageKey: turn.messageKey,
      runId: turn.runId,
      success: false,
      error: message.slice(0, 4_000)
    });
    results.push({ messageKey: turn.messageKey, status: "deferred", error: message });
  }
}

console.log(JSON.stringify({ claimed: turns.length, results }));
