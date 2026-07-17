#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/flusso}"
APP_USER="${APP_USER:-flusso}"
APP_HOME="${APP_HOME:-/home/flusso}"
PLUGIN_ID="flusso-a2a-guard"
PLUGIN_DIR="$APP_DIR/openclaw-plugins/$PLUGIN_ID"
TOOL_IDS_JSON='["flusso_content_engine","flusso_marketplace"]'

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this OpenClaw configurator as root." >&2
  exit 1
fi

if ! command -v openclaw >/dev/null 2>&1; then
  echo "OpenClaw is not installed yet; skipped the Flusso A2A guard plugin."
  exit 0
fi

run_openclaw() {
  runuser -u "$APP_USER" -- env HOME="$APP_HOME" openclaw "$@"
}

if ! run_openclaw plugins inspect "$PLUGIN_ID" --json >/dev/null 2>&1; then
  run_openclaw plugins install -l "$PLUGIN_DIR"
fi

run_openclaw plugins enable "$PLUGIN_ID"
run_openclaw config set "plugins.entries.$PLUGIN_ID.hooks.allowConversationAccess" true --strict-json
run_openclaw config set "plugins.entries.$PLUGIN_ID.hooks.allowPromptInjection" true --strict-json

agents_json="$(run_openclaw config get agents.list --json)"
for runtime_agent in main flusso; do
  agent_index="$(node -e '
const agents = JSON.parse(process.argv[1]);
const index = agents.findIndex((agent) => agent?.id === process.argv[2]);
if (index < 0) process.exit(1);
process.stdout.write(String(index));
' "$agents_json" "$runtime_agent")" || {
    echo "The $runtime_agent agent is missing from OpenClaw config." >&2
    exit 1
  }

  allow_path="agents.list[$agent_index].tools.allow"
  if current_tools="$(run_openclaw config get "$allow_path" --json 2>/dev/null)"; then
    tool_path="$allow_path"
  else
    tool_path="agents.list[$agent_index].tools.alsoAllow"
    current_tools="$(run_openclaw config get "$tool_path" --json 2>/dev/null || printf '[]')"
  fi

  allowed_tools="$(node -e '
const tools = JSON.parse(process.argv[1]);
if (!Array.isArray(tools)) throw new Error("Agent tool policy must be an array.");
const requiredTools = JSON.parse(process.argv[2]);
for (const tool of requiredTools) {
  if (!tools.includes(tool)) tools.push(tool);
}
process.stdout.write(JSON.stringify(tools));
' "$current_tools" "$TOOL_IDS_JSON")"
  run_openclaw config set "$tool_path" "$allowed_tools" --strict-json
  run_openclaw config set "agents.list[$agent_index].tools.exec.mode" '"auto"' --strict-json
done
run_openclaw config validate

drop_in_dir="$APP_HOME/.config/systemd/user/openclaw-gateway.service.d"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$drop_in_dir"
printf '%s\n' \
  '[Service]' \
  'EnvironmentFile=/etc/flusso/flusso.env' \
  'Restart=always' \
  'RestartSec=5' \
  > "$drop_in_dir/flusso.conf"
chown "$APP_USER:$APP_USER" "$drop_in_dir/flusso.conf"
chmod 0640 "$drop_in_dir/flusso.conf"

app_uid="$(id -u "$APP_USER")"
runtime_dir="/run/user/$app_uid"
if [[ -S "$runtime_dir/bus" ]]; then
  runuser -u "$APP_USER" -- env \
    HOME="$APP_HOME" \
    XDG_RUNTIME_DIR="$runtime_dir" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=$runtime_dir/bus" \
    systemctl --user daemon-reload
  runuser -u "$APP_USER" -- env \
    HOME="$APP_HOME" \
    XDG_RUNTIME_DIR="$runtime_dir" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=$runtime_dir/bus" \
    systemctl --user try-restart openclaw-gateway.service
fi

echo "Flusso A2A guard plugin is configured."
