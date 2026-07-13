#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/flusso}"
ENV_FILE="${ENV_FILE:-/etc/flusso/flusso.env}"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "Cannot read production environment file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

last_error=""
for _attempt in $(seq 1 20); do
  if output=$(node "$APP_DIR/scripts/verify-deployment.mjs" 2>&1); then
    printf '%s\n' "$output"
    exit 0
  fi
  last_error="$output"
  sleep 1
done

echo "Deployment verification failed after 20 attempts." >&2
printf '%s\n' "$last_error" >&2
exit 1