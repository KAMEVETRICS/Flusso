/* global console */
import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  containsExactToken,
  parseCliJson
} from "../lib/a2a-runtime-readiness.mjs";

const token = "FLUSSO_A2A_READY";

function configureUserEnvironment() {
  if (!process.env.HOME) process.env.HOME = "/home/flusso";
  if (typeof process.getuid !== "function") return;

  const runtimeDir = `/run/user/${process.getuid()}`;
  process.env.XDG_RUNTIME_DIR = runtimeDir;
  process.env.DBUS_SESSION_BUS_ADDRESS = `unix:path=${runtimeDir}/bus`;
}

function run(command, args, label, timeout) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout,
    windowsHide: true,
    env: { ...process.env, NO_COLOR: "1" }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "unknown failure").trim();
    throw new Error(`${label} failed: ${detail}`);
  }
  return result.stdout;
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function waitForGateway(attempts = 12, delayMs = 5_000) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return run(
        "openclaw",
        ["gateway", "status", "--require-rpc", "--json"],
        "OpenClaw gateway status",
        30_000
      );
    } catch (error) {
      lastError = error;
      if (attempt < attempts) sleep(delayMs);
    }
  }

  throw lastError;
}

configureUserEnvironment();

waitForGateway();

const response = parseCliJson(
  run(
    "openclaw",
    [
      "agent",
      "--agent",
      "flusso",
      "--session-key",
      `flusso-readiness-${Date.now()}`,
      "--message",
      `Reply with exactly ${token}. Do not call tools.`,
      "--json"
    ],
    "Flusso response probe",
    180_000
  ),
  "Flusso response probe"
);

if (!containsExactToken(response, token)) {
  throw new Error(`Flusso responded, but did not return the required ${token} token.`);
}

console.log(JSON.stringify({ status: "ready", agent: "flusso", response: token }));
