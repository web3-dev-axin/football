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
# X Layer testnet deployment addresses (also live in deployments/xlayer-testnet.json).
NEXT_PUBLIC_MOCK_USDC_ADDRESS="${NEXT_PUBLIC_MOCK_USDC_ADDRESS:-0xbf23ac02560ef2100ccec9130ce3e47cb47940f5}"
NEXT_PUBLIC_MARKET_FACTORY_ADDRESS="${NEXT_PUBLIC_MARKET_FACTORY_ADDRESS:-0xe2312cbc7d98d9080780e1a158b3b6fe48c189b3}"
NEXT_PUBLIC_ORACLE_ADDRESS="${NEXT_PUBLIC_ORACLE_ADDRESS:-0x8ca7f9c9d739c582c95b3a48f9f7668aff1a2e78}"
NEXT_PUBLIC_CTF_ADDRESS="${NEXT_PUBLIC_CTF_ADDRESS:-0x7c991fa2c5f745c9c6768f5fc9b99de4a4ec1e85}"

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
CORS_ALLOWED_ORIGINS_DEFAULT="http://${DEPLOY_HOST}"
CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-$CORS_ALLOWED_ORIGINS_DEFAULT}"
# Default to the dockerized Postgres that ships with the VPS (port 5432).
# Set DATABASE_URL="" explicitly to opt out and force in-memory mode.
DATABASE_URL="${DATABASE_URL-postgres://polygoal:polygoal@127.0.0.1:5432/polygoal}"
PONDER_SCHEMA="${PONDER_SCHEMA:-ponder}"
PONDER_RPC_URL="${PONDER_RPC_URL:-$NEXT_PUBLIC_RPC_URL}"
PONDER_START_BLOCK="${PONDER_START_BLOCK:-30743211}"

# shellcheck disable=SC2029
"${SSH_CMD[@]}" env \
  REMOTE_DIR="$REMOTE_DIR" \
  NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
  NEXT_PUBLIC_CHAIN_ID="$NEXT_PUBLIC_CHAIN_ID" \
  NEXT_PUBLIC_RPC_URL="$NEXT_PUBLIC_RPC_URL" \
  NEXT_PUBLIC_MOCK_USDC_ADDRESS="$NEXT_PUBLIC_MOCK_USDC_ADDRESS" \
  NEXT_PUBLIC_MARKET_FACTORY_ADDRESS="$NEXT_PUBLIC_MARKET_FACTORY_ADDRESS" \
  NEXT_PUBLIC_ORACLE_ADDRESS="$NEXT_PUBLIC_ORACLE_ADDRESS" \
  NEXT_PUBLIC_CTF_ADDRESS="$NEXT_PUBLIC_CTF_ADDRESS" \
  INTERNAL_API_URL="$INTERNAL_API_URL" \
  API_UPSTREAM="$API_UPSTREAM" \
  CORS_ALLOWED_ORIGINS="$CORS_ALLOWED_ORIGINS" \
  DATABASE_URL="$DATABASE_URL" \
  PONDER_SCHEMA="$PONDER_SCHEMA" \
  PONDER_RPC_URL="$PONDER_RPC_URL" \
  PONDER_START_BLOCK="$PONDER_START_BLOCK" \
  bash "$REMOTE_PROVISION"

echo ""
echo "Done. Open: http://${DEPLOY_HOST}"
echo "Browser API base: NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} (nginx proxies → ${API_UPSTREAM})"
echo "SSR API base:     INTERNAL_API_URL=${INTERNAL_API_URL}"
