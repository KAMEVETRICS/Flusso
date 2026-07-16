#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/flusso"
APP_USER="flusso"
ENV_FILE="/etc/flusso/flusso.env"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this updater as root." >&2
  exit 1
fi

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "$APP_DIR is not a Git clone." >&2
  exit 1
fi

if [[ -n "$(runuser -u "$APP_USER" -- git -C "$APP_DIR" status --porcelain)" ]]; then
  echo "The VPS worktree has local changes. Commit or remove them before updating." >&2
  exit 1
fi

runuser -u "$APP_USER" -- git -C "$APP_DIR" pull --ff-only
runuser -u "$APP_USER" -- npm --prefix "$APP_DIR" ci
runuser -u "$APP_USER" -- npm --prefix "$APP_DIR" run build

install -o root -g root -m 0644 \
  "$APP_DIR/deploy/systemd/flusso-a2a.service" \
  /etc/systemd/system/flusso-a2a.service
install -o root -g root -m 0644 \
  "$APP_DIR/deploy/systemd/flusso-a2a-health.service" \
  /etc/systemd/system/flusso-a2a-health.service
install -o root -g root -m 0644 \
  "$APP_DIR/deploy/systemd/flusso-a2a-health.timer" \
  /etc/systemd/system/flusso-a2a-health.timer
install -o root -g root -m 0644 \
  "$APP_DIR/deploy/systemd/flusso-recovery.service" \
  /etc/systemd/system/flusso-recovery.service
install -o root -g root -m 0644 \
  "$APP_DIR/deploy/systemd/flusso-recovery.timer" \
  /etc/systemd/system/flusso-recovery.timer
systemctl daemon-reload
systemctl restart flusso-engine.service
systemctl enable --now flusso-recovery.timer
loginctl enable-linger "$APP_USER"
APP_DIR="$APP_DIR" APP_USER="$APP_USER" bash "$APP_DIR/deploy/configure-openclaw.sh"

if systemctl is-enabled --quiet flusso-a2a.service; then
  systemctl restart flusso-a2a.service
  systemctl enable --now flusso-a2a-health.timer
  systemctl start flusso-a2a-health.service
fi

APP_DIR="$APP_DIR" ENV_FILE="$ENV_FILE" bash "$APP_DIR/deploy/smoke-test.sh"

echo "Deployment updated successfully."
