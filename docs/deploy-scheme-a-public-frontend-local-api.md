# 方案 A：公网前端（VPS）+ 同源 `/api` 反代

本仓库实际采用的是 **「同源 `/api` 反代」**：浏览器只与 VPS 通信，Nginx 在同一个域名 / IP 下把 `/api/*` 反代到本机 API，前端 SSR 直接走 `INTERNAL_API_URL`。这套做法同时绕开 CORS 和 Chrome Private Network Access（公网 origin → loopback）的拦截，是新部署的默认方式。

> 老方案：把后端通过 Cloudflare Tunnel / ngrok 暴露成 `https://api.example.com`，前端构建时把 `NEXT_PUBLIC_API_URL` 写成该域名。仍可用，但不推荐，因为多了一条独立的隧道运维。详细 fallback 步骤见文末 §A1。

---

## 架构概览

```
Browser
  │
  ├─ http(s)://VPS_IP_OR_DOMAIN/        ──► nginx ──► next start  (127.0.0.1:3000)
  │
  └─ http(s)://VPS_IP_OR_DOMAIN/api/*   ──► nginx ──► apps/api    (127.0.0.1:8787)

Next SSR (server-side)
  └─ INTERNAL_API_URL=http://127.0.0.1:8787  (本机直连，不走 nginx)
```

要点：

- 浏览器永远看到同一个 origin（`http://VPS_IP` 或 `https://your-domain`），既无跨域，也不存在公网→loopback 的 PNA 拦截。
- Next.js 在本地开发时由 `apps/web/next.config.ts` 的 `rewrites` 把 `/api/:path*` 重写到 `INTERNAL_API_URL`，与生产 Nginx 行为一致。
- 前端代码统一通过 `apps/web/lib/api-client.ts` 使用 `NEXT_PUBLIC_API_URL=/api`。

---

## 1. 一键脚本

仓库内提供两个脚本，最简部署就是设置环境变量 + 执行：

```bash
# 本机：把仓库 rsync 到 VPS 并触发远端 provision
chmod +x scripts/deploy-vps-ip-http.sh
DEPLOY_HOST=YOUR_VPS_IP ./scripts/deploy-vps-ip-http.sh
```

`scripts/deploy-vps-ip-http.sh` 会：

1. 通过 SSH 同步代码到 `REMOTE_DIR`（默认 `/var/www/polygoal`），排除 `node_modules`、`.next`、`.git`、`.env*`。
2. 远程调用 `scripts/deploy-vps-remote-provision.sh`，传入：
   - `NEXT_PUBLIC_API_URL=/api`
   - `INTERNAL_API_URL=http://127.0.0.1:8787`
   - `API_UPSTREAM=127.0.0.1:8787`
   - `NEXT_PUBLIC_CHAIN_ID`、`NEXT_PUBLIC_RPC_URL`（默认 X Layer Testnet）

`scripts/deploy-vps-remote-provision.sh` 在 VPS 上执行：

- 安装 `curl git nginx ufw ca-certificates` + Bun。
- 开放 22 / 80 / 443 端口，启用 ufw。
- `bun install && (cd apps/web && bun run build)`。
- 写入 `/etc/systemd/system/polygoal-web.service`（`bun run start`，端口 3000）。
- 写入 `/etc/nginx/sites-available/polygoal.conf`：

```nginx
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 4m;

    location /api/ {
        proxy_pass http://127.0.0.1:8787/;   # strip /api/ prefix
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- `nginx -t && systemctl reload nginx`、`systemctl enable --now polygoal-web.service`。

---

## 2. 启动 API（VPS 上 or 内网机）

部署脚本默认假设 **API 跑在同一台 VPS 的 `127.0.0.1:8787`**。生产建议：

```bash
# /etc/systemd/system/polygoal-api.service
[Unit]
Description=Polygoal API
After=network.target postgresql.service

[Service]
WorkingDirectory=/var/www/polygoal
EnvironmentFile=/var/www/polygoal/.env
ExecStart=/root/.bun/bin/bun apps/api/src/main.ts
Restart=always

[Install]
WantedBy=multi-user.target
```

`/var/www/polygoal/.env` 最少包含：

```env
NODE_ENV=production
API_HOST=127.0.0.1
API_PORT=8787
DATABASE_URL=postgresql://...
RPC_URL=https://testrpc.xlayer.tech/terigon
CHAIN_ID=1952
PRIVATE_KEY_OPERATOR=0x...        # 仅在需要 admin 写操作时
ADMIN_API_TOKEN=...
PONDER_DATABASE_URL=postgresql://...
PONDER_SCHEMA=ponder
```

如果 API 不在 VPS 上，改 `API_UPSTREAM=内网API地址:端口`，并通过 WireGuard / Tailscale / Cloudflare Tunnel 把对端口连到 VPS 上（在 VPS 上仍是 `127.0.0.1:8787`）。**不要**把 API 直接 listen 在公网。

---

## 3. Indexer（Ponder）

Ponder 0.16 需要单独跑：

```bash
# 在能直连 PONDER_DATABASE_URL 和 RPC 的机器上
cd /var/www/polygoal
bun run --filter @app/indexer ponder start
```

生产建议写一个 `polygoal-indexer.service`，与 API 共享 PostgreSQL（Ponder 默认写到 `ponder` schema）。API 在 schema 存在时会通过 `PonderReader` 直接读取链上索引数据。

---

## 4. DNS / TLS（可选）

- 仅 IP 上线（默认）：访问 `http://VPS_IP/` 即可，无需 DNS。
- 配域名 + HTTPS：
  1. NameSilo 等 DNS 服务商：`www`（或 `@`）A 记录 → VPS IP。
  2. VPS 上安装 `certbot --nginx`，按提示给 `your-domain.com` 颁发 Let's Encrypt 证书。
  3. 重新执行 deploy 脚本或手动改 `polygoal.conf`，加 `listen 443 ssl`、`ssl_certificate*`，把 80 端口 301 → 443。
  4. 前端构建仍然使用 `NEXT_PUBLIC_API_URL=/api`，不需要其他改动。

---

## 5. 部署后验证

```bash
# 浏览器 / curl 同源访问
curl -i http://YOUR_HOST/api/health
curl -i http://YOUR_HOST/api/markets?status=open
curl -i http://YOUR_HOST/                # 首页 HTML

# VPS 上服务状态
systemctl status polygoal-web.service
systemctl status polygoal-api.service        # 若已配置
nginx -t
journalctl -u polygoal-web.service -n 100 --no-pager
```

前端应能：

- 首页 `/` 展示 X Layer Testnet 部署的 World Cup 2026 小组赛 `match_winner` 市场。
- `/markets/[marketId]` 展示对应市场详情 + Provider odds + 链上 close time。
- `/portfolio` 在连接钱包后通过 `/api/portfolio/:wallet`（含 Ponder fallback）返回持仓。
- `/settlements` 展示 `/api/settlements?status=`。
- `/operator` 在持有 `ADMIN_API_TOKEN` 时可调用 admin 接口。

---

## 6. CORS / PNA / 常见坑

- 浏览器 PNA（Chrome 117+）会拦截 `public origin → http://localhost:*`。**同源 `/api`** 是规避它最稳妥的做法，本仓库默认采用。
- 不要在生产前端写 `localhost` 作为 API 地址；不要把 `NEXT_PUBLIC_API_URL` 留空。
- 一旦在 `next.config.ts` rewrites 之外手动 `fetch("http://...")`，请确保走 HTTPS 并配置 CORS。
- `apps/api/src/app.ts` 的 `cors()` 默认放开多数 origin；如果改了 CORS allowlist，注意把 `https://your-domain.com` 加进去。
- 接 X Layer Testnet 时 `NEXT_PUBLIC_RPC_URL` 必须是公网可达的（默认值 `https://testrpc.xlayer.tech/terigon`），不要指向 `http://localhost:8545`。

---

## A1（Fallback）方案 A 原版：Cloudflare Tunnel / ngrok

只在「VPS 上不允许跑 API」时使用。这种情况下浏览器需要直接访问 `https://api.example.com`：

1. 域名托管在 Cloudflare → 用 Cloudflare Tunnel：`api.example.com → http://localhost:8787`。
2. 也可以用 ngrok：`ngrok http 8787`，得到 `https://xxxx.ngrok-free.app`。
3. 前端构建时把 `NEXT_PUBLIC_API_URL` 写成上面拿到的 HTTPS URL：

```bash
cd apps/web
NEXT_PUBLIC_API_URL=https://api.example.com bun run build
```

4. 在 VPS 上仍然跑 `next start`，但 Nginx 不再代理 `/api`。
5. 在 `apps/api/src/app.ts` 的 `cors()` 中把前端 origin 显式加入 allowlist。

> ⚠️ 这条路径需要保持隧道常驻 + Cloudflare 配置同步，运维成本远高于同源方案，仅作为应急 fallback。

---

## 相关文件

- `scripts/deploy-vps-ip-http.sh`：本机入口，定义环境变量并触发远端脚本。
- `scripts/deploy-vps-remote-provision.sh`：VPS 端 provisioning（apt / bun / nginx / systemd）。
- `apps/web/next.config.ts`：本地开发的 `/api/:path*` rewrites（与 Nginx 行为对齐）。
- `apps/web/lib/api-client.ts`：所有前端 fetch 走 `NEXT_PUBLIC_API_URL=/api`。
- `apps/api/src/app.ts`：API 的 CORS / 路由 / Ponder reader 集成。
- `deployments/xlayer-testnet.json`：当前部署的合约和 market 列表。
