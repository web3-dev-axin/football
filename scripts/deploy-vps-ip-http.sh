#!/usr/bin/env bash
# Deploy Next.js web (HTTP by IP) to Ubuntu VPS — scheme A friendly.
#
# Browser → http://VPS_IP/         → nginx → next (127.0.0.1:3000)
# Browser → http://VPS_IP/api/*    → nginx → API  (127.0.0.1:8787)
# This same-origin proxy sidesteps CORS *and* Chrome's Private Network Access
# block (public origin → loopback), so the front-end no longer needs to talk
# to "localhost" directly.
#
# Prerequisites:
#   1. SSH key login works: ssh-copy-id root@YOUR_IP
#   2. Local env (sensible defaults provided below):
#        export DEPLOY_HOST=172.245.146.143
#      Optional overrides:
#        export DEPLOY_USER=root
#        export REMOTE_DIR=/var/www/polygoal
#        export NEXT_PUBLIC_API_URL=/api   # same-origin (default)
#        export NEXT_PUBLIC_CHAIN_ID=1952
#        export NEXT_PUBLIC_RPC_URL=https://testrpc.xlayer.tech/terigon
#        export API_UPSTREAM=127.0.0.1:8787
#        export INTERNAL_API_URL=http://127.0.0.1:8787
#
# Usage:
#   chmod +x scripts/deploy-vps-ip-http.sh
#   ./scripts/deploy-vps-ip-http.sh

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-172.245.146.143}"
DEPLOY_USER="${DEPLOY_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/polygoal}"
# Same-origin path by default so the browser never crosses origins/PNA.
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-/api}"
# Where nginx on the VPS forwards /api/* to.
API_UPSTREAM="${API_UPSTREAM:-127.0.0.1:8787}"
# Where Next SSR talks to the API directly (no browser hop).
INTERNAL_API_URL="${INTERNAL_API_URL:-http://127.0.0.1:8787}"

NEXT_PUBLIC_CHAIN_ID="${NEXT_PUBLIC_CHAIN_ID:-1952}"
NEXT_PUBLIC_RPC_URL="${NEXT_PUBLIC_RPC_URL:-https://testrpc.xlayer.tech/terigon}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_CMD=(ssh -o StrictHostKeyChecking=accept-new "${DEPLOY_USER}@${DEPLOY_HOST}")

echo "==> Ensure rsync exists on VPS (needed for rsync over SSH)"
"${SSH_CMD[@]}" 'command -v rsync >/dev/null 2>&1 || { export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq rsync; }'

echo "==> Syncing repo to ${DEPLOY_USER}@${DEPLOY_HOST}:${REMOTE_DIR}"
rsync -az --protocol=29 --delete \
  --exclude node_modules \
  --exclude apps/web/.next \
  --exclude packages/*/node_modules \
  --exclude apps/*/node_modules \
  --exclude .git \
  --exclude .env \
  --exclude '.env.*' \
  "${REPO_ROOT}/" "${DEPLOY_USER}@${DEPLOY_HOST}:${REMOTE_DIR}/"

echo "==> Provisioning remote (apt, bun, nginx, systemd)"
REMOTE_PROVISION="${REMOTE_DIR}/scripts/deploy-vps-remote-provision.sh"
"${SSH_CMD[@]}" chmod +x "$REMOTE_PROVISION"
# shellcheck disable=SC2029
"${SSH_CMD[@]}" env \
  REMOTE_DIR="$REMOTE_DIR" \
  NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
  NEXT_PUBLIC_CHAIN_ID="$NEXT_PUBLIC_CHAIN_ID" \
  NEXT_PUBLIC_RPC_URL="$NEXT_PUBLIC_RPC_URL" \
  INTERNAL_API_URL="$INTERNAL_API_URL" \
  API_UPSTREAM="$API_UPSTREAM" \
  bash "$REMOTE_PROVISION"

echo ""
echo "Done. Open: http://${DEPLOY_HOST}"
echo "Browser API base: NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} (nginx proxies → ${API_UPSTREAM})"
echo "SSR API base:     INTERNAL_API_URL=${INTERNAL_API_URL}"
