/* global console */
import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  parseCliJson,
  requireActiveClient,
  requireReadyResult
} from "../lib/a2a-runtime-readiness.mjs";

const commandTimeoutMs = 240_000;

function configureUserEnvironment() {
  if (!process.env.HOME) process.env.HOME = "/home/flusso";
  if (typeof process.getuid !== "function") return;

  const runtimeDir = `/run/user/${process.getuid()}`;
  process.env.XDG_RUNTIME_DIR = runtimeDir;
  process.env.DBUS_SESSION_BUS_ADDRESS = `unix:path=${runtimeDir}/bus`;
}

function call(command, args, timeout = commandTimeoutMs) {
  return spawnSync(command, args, {
    encoding: "utf8",
    timeout,
    windowsHide: true,
    env: { ...process.env, NO_COLOR: "1" }
  });
}

function failure(result, label) {
  if (result.error) return result.error;
  const detail = (result.stderr || result.stdout || "unknown failure").trim();
  return new Error(`${label} failed: ${detail}`);
}

function run(command, args, label, timeout) {
  const result = call(command, args, timeout);
  if (result.status !== 0) throw failure(result, label);
  return result.stdout;
}

function runJson(command, args, label, timeout) {
  return parseCliJson(run(command, args, label, timeout), label);
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function waitForSuccess(command, args, attempts = 12, delayMs = 5_000) {
  let result;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result = call(command, args, 30_000);
    if (result.status === 0) return result;
    if (attempt < attempts) sleep(delayMs);
  }

  return result;
}

configureUserEnvironment();

let daemon = call("okx-a2a", ["daemon", "status"], 30_000);
if (daemon.status !== 0) {
  run("okx-a2a", ["daemon", "start"], "OKX A2A daemon start", 120_000);
  daemon = call("okx-a2a", ["daemon", "status"], 30_000);
}
if (daemon.status !== 0) throw failure(daemon, "OKX A2A daemon status");

let gateway = call(
  "openclaw",
  ["gateway", "status", "--require-rpc", "--json"],
  30_000
);
if (gateway.status !== 0) {
  run("openclaw", ["gateway", "restart", "--wait", "30s"], "OpenClaw gateway restart", 90_000);
  gateway = waitForSuccess(
    "openclaw",
    ["gateway", "status", "--require-rpc", "--json"]
  );
}
if (gateway.status !== 0) throw failure(gateway, "OpenClaw gateway status");

requireReadyResult(
  runJson("okx-a2a", ["switch-runtime", "--json"], "OKX runtime switch"),
  "OKX runtime switch"
);
requireActiveClient(
  runJson("okx-a2a", ["agent", "refresh", "--json"], "OKX agent refresh")
);
requireReadyResult(
  runJson("okx-a2a", ["setup", "--json"], "OKX A2A setup"),
  "OKX A2A setup"
);

const active = requireActiveClient(
  runJson("okx-a2a", ["agent", "refresh", "--json"], "Final OKX agent refresh")
);
gateway = waitForSuccess(
  "openclaw",
  ["gateway", "status", "--require-rpc", "--json"]
);
if (gateway.status !== 0) throw failure(gateway, "Final OpenClaw gateway status");

console.log(JSON.stringify({ status: "ready", ...active }));
