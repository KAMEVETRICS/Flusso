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

systemctl restart flusso-engine.service
APP_DIR="$APP_DIR" ENV_FILE="$ENV_FILE" bash "$APP_DIR/deploy/smoke-test.sh"

echo "Deployment updated successfully."