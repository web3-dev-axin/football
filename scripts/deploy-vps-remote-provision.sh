#!/usr/bin/env bash
# Run ON the VPS (invoked by deploy-vps-ip-http.sh) as root by default.
set -euo pipefail

: "${REMOTE_DIR:?}"
: "${NEXT_PUBLIC_API_URL:?}"
: "${NEXT_PUBLIC_CHAIN_ID:?}"
: "${NEXT_PUBLIC_RPC_URL:?}"
INTERNAL_API_URL="${INTERNAL_API_URL:-http://127.0.0.1:8787}"
API_UPSTREAM="${API_UPSTREAM:-127.0.0.1:8787}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git nginx ufw ca-certificates

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
bun run build

SERVICE_PATH=/etc/systemd/system/polygoal-web.service
cat >"$SERVICE_PATH" <<UNIT
[Unit]
Description=Polygoal Next.js
After=network.target

[Service]
Type=simple
WorkingDirectory=${REMOTE_DIR}/apps/web
Environment=NODE_ENV=production
ExecStart=/root/.bun/bin/bun run start
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
systemctl enable polygoal-web.service
systemctl restart polygoal-web.service
systemctl --no-pager --full status polygoal-web.service || true
