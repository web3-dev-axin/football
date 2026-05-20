#!/usr/bin/env bash
# Run ON the VPS (invoked by deploy-vps-ip-http.sh) as root by default.
set -euo pipefail

: "${REMOTE_DIR:?}"
: "${NEXT_PUBLIC_API_URL:?}"
: "${NEXT_PUBLIC_CHAIN_ID:?}"
: "${NEXT_PUBLIC_RPC_URL:?}"
INTERNAL_API_URL="${INTERNAL_API_URL:-http://127.0.0.1:8787}"
API_UPSTREAM="${API_UPSTREAM:-127.0.0.1:8787}"
API_HOST="${API_HOST:-127.0.0.1}"
API_PORT="${API_PORT:-8787}"
CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-*}"
DATABASE_URL="${DATABASE_URL:-}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git nginx ufw ca-certificates

# Ensure at least 4 GB of swap so low-RAM VPS can finish next build.
if [ ! -f /swapfile-polygoal ]; then
  fallocate -l 4G /swapfile-polygoal || dd if=/dev/zero of=/swapfile-polygoal bs=1M count=4096
  chmod 600 /swapfile-polygoal
  mkswap /swapfile-polygoal >/dev/null
  swapon /swapfile-polygoal
  grep -q "/swapfile-polygoal" /etc/fstab || echo "/swapfile-polygoal none swap sw 0 0" >> /etc/fstab
fi

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
fi
export PATH="/root/.bun/bin:${PATH}"

ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

cd "$REMOTE_DIR"
bun install

cd apps/web
export NEXT_PUBLIC_API_URL NEXT_PUBLIC_CHAIN_ID NEXT_PUBLIC_RPC_URL INTERNAL_API_URL
# Low-RAM VPS guard rail: cap Node heap so the TS-check worker does not OOM
# (default heap is sized to host RAM, which is way over what 1 GB boxes have).
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
bun run build

API_SERVICE_PATH=/etc/systemd/system/polygoal-api.service
cat >"$API_SERVICE_PATH" <<UNIT
[Unit]
Description=Polygoal API (Hono)
After=network.target

[Service]
Type=simple
WorkingDirectory=${REMOTE_DIR}/apps/api
Environment=NODE_ENV=production
Environment=API_HOST=${API_HOST}
Environment=API_PORT=${API_PORT}
Environment=CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS}
$( [ -n "$DATABASE_URL" ] && printf 'Environment=DATABASE_URL=%s\n' "$DATABASE_URL" )
ExecStart=/root/.bun/bin/bun src/server.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  # NodeSource setup for Node 20 LTS (Next.js 16 needs Node ≥ 20 and Bun's
  # ReadableStream impl crashes Next's RSC streaming with kState errors).
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
  NODE_BIN="$(command -v node)"
fi

SERVICE_PATH=/etc/systemd/system/polygoal-web.service
cat >"$SERVICE_PATH" <<UNIT
[Unit]
Description=Polygoal Next.js
After=network.target polygoal-api.service

[Service]
Type=simple
WorkingDirectory=${REMOTE_DIR}/apps/web
Environment=NODE_ENV=production
Environment=INTERNAL_API_URL=${INTERNAL_API_URL}
# Run next via Node (Bun + Next 16 RSC streaming hits
# controller[kState].transformAlgorithm crash mid-stream).
ExecStart=${NODE_BIN} node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

NGINX_SITE=/etc/nginx/sites-available/polygoal.conf
cat >"$NGINX_SITE" <<NGX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 4m;

    # Same-origin API proxy → bypasses browser CORS + Private Network Access.
    # Browser hits /api/* (e.g. /api/settlements), nginx forwards to the local API
    # without the /api/ prefix (e.g. /settlements on the backend).
    location /api/ {
        proxy_pass http://${API_UPSTREAM}/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGX

ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/polygoal.conf
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t
systemctl reload nginx

systemctl daemon-reload
systemctl enable polygoal-api.service polygoal-web.service
systemctl restart polygoal-api.service
systemctl restart polygoal-web.service
sleep 2
systemctl --no-pager --full status polygoal-api.service || true
systemctl --no-pager --full status polygoal-web.service || true

echo "==> Smoke checks"
curl -fsS -m 5 "http://127.0.0.1:${API_PORT}/health" && echo " api: ok" || echo " api: FAILED"
curl -fsS -m 5 "http://127.0.0.1/api/health" && echo " nginx /api: ok" || echo " nginx /api: FAILED"
