#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/flusso}"
APP_USER="${APP_USER:-flusso}"
APP_HOME="${APP_HOME:-/home/flusso}"
PLUGIN_ID="flusso-a2a-guard"
PLUGIN_DIR="$APP_DIR/openclaw-plugins/$PLUGIN_ID"

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
run_openclaw config validate

drop_in_dir="$APP_HOME/.config/systemd/user/openclaw-gateway.service.d"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$drop_in_dir"
printf '%s\n' \
  '[Service]' \
  'EnvironmentFile=/etc/flusso/flusso.env' \
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