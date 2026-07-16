/* global console */
import { spawnSync } from "node:child_process";
import process from "node:process";

const action = process.argv[2];
const allowedActions = new Set(["start", "status", "restart"]);

if (!allowedActions.has(action)) {
  console.error("Usage: node scripts/manage-a2a-daemon.mjs <start|status|restart>");
  process.exit(64);
}

if (!process.env.HOME) process.env.HOME = "/home/flusso";
if (typeof process.getuid === "function") {
  const runtimeDir = `/run/user/${process.getuid()}`;
  process.env.XDG_RUNTIME_DIR = runtimeDir;
  process.env.DBUS_SESSION_BUS_ADDRESS = `unix:path=${runtimeDir}/bus`;
}

const result = spawnSync("okx-a2a", ["daemon", action], {
  stdio: "inherit",
  windowsHide: true,
  env: process.env
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
