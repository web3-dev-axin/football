# 公网前端（VPS）+ 同源 `/api` 反代 — 部署手册

本仓库的标准部署方案：浏览器只与一个 VPS 通信，Nginx 在同一个域名 / IP 下同时反代 `/api/*`（Hono API）和 `/`（Next.js）。Ponder 索引器、Hono API、Next.js 三个服务都跑在同一台 VPS 上，通过 `127.0.0.1` 互联。

这套做法天然规避两类浏览器问题：

- **跨域 / CORS**：前端和 API 共享 origin，浏览器从不发起跨域请求。
- **Chrome Private Network Access (PNA, 117+)**：`public origin → http://localhost:*` 会被拦截；同源 `/api` 让浏览器永远只看到公网 origin。API 仍兜底为 PNA preflight 应答 `Access-Control-Allow-Private-Network: true`，覆盖少数仍然显式发请求的客户端（`apps/api/src/app.ts`）。

> 老方案（Cloudflare Tunnel / ngrok 把 API 暴露成 `https://api.example.com`）保留在文末 §A1，仅作 fallback。

---

## 1. 架构概览

```
            ┌──────────────────────────────────────┐
Browser ───►│ nginx :80 (default_server)           │
            │   /api/*  → 127.0.0.1:8787  (API)    │
            │   /       → 127.0.0.1:3000  (Next)   │
            └──────────────────────────────────────┘
                          │                ▲
                          ▼                │
            ┌──────────────────────┐  INTERNAL_API_URL
            │ polygoal-api.service │◄────────────┐
            │ Hono on :8787        │             │
            │  ↳ reads Postgres    │             │
            │  ↳ reads ponder.*    │      ┌──────────────────────┐
            └──────────────────────┘      │ polygoal-web.service │
                          │               │ next start :3000     │
                          ▼               │  (Node 20)           │
            ┌──────────────────────┐      └──────────────────────┘
            │ Postgres :5432       │
            │  public.* (legacy)   │
            │  ponder.*  (indexer) │
            └──────────────────────┘
                          ▲
                          │
            ┌──────────────────────────┐
            │ polygoal-indexer.service │
            │ ponder start --schema    │
            │   ponder (X Layer RPC)   │
            └──────────────────────────┘
```

约定：

- 浏览器永远访问 `http://VPS_IP/` 或 `https://your-domain/`，所有 API 调用走 `/api/*`。
- 前端代码通过 `apps/web/lib/api-client.ts` 使用 `NEXT_PUBLIC_API_URL=/api`。
- 本地 `bun --cwd apps/web dev` 也是同源 `/api`：`apps/web/next.config.ts` 的 `rewrites` 把 `/api/:path*` 重写到 `INTERNAL_API_URL`。
- Next SSR 用 `INTERNAL_API_URL=http://127.0.0.1:8787` 直连 API，避免 server → nginx → API 的额外一跳。
- API 在 `ponder` schema 存在时通过 `apps/api/src/services/ponder-reader.ts` 直接返回链上索引数据，让浏览器、运营和数据库看到同一份链上真相。

---

## 2. 一键脚本

```bash
chmod +x scripts/deploy-vps-ip-http.sh
DEPLOY_HOST=YOUR_VPS_IP ./scripts/deploy-vps-ip-http.sh
```

可选环境变量（脚本头部都有默认值）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DEPLOY_HOST` | `172.245.146.143` | VPS 公网 IP / 域名 |
| `DEPLOY_USER` | `root` | SSH 用户 |
| `REMOTE_DIR` | `/var/www/polygoal` | 远端代码根目录 |
| `NEXT_PUBLIC_API_URL` | `/api` | **不要改**，改了就破坏同源策略 |
| `INTERNAL_API_URL` | `http://127.0.0.1:8787` | Next SSR 直连 API |
| `API_UPSTREAM` | `127.0.0.1:8787` | nginx `/api/` 的 upstream |
| `NEXT_PUBLIC_CHAIN_ID` | `1952` | X Layer Testnet |
| `NEXT_PUBLIC_RPC_URL` | `https://testrpc.xlayer.tech/terigon` | 浏览器 + 索引器 RPC |
| `NEXT_PUBLIC_MOCK_USDC_ADDRESS` / `NEXT_PUBLIC_MARKET_FACTORY_ADDRESS` / `NEXT_PUBLIC_ORACLE_ADDRESS` / `NEXT_PUBLIC_CTF_ADDRESS` | 取自 `deployments/xlayer-testnet.json` 当前 infra | 写入前端环境，钱包交互依赖 |
| `CORS_ALLOWED_ORIGINS` | `http://${DEPLOY_HOST}` | API 允许的浏览器 origin，逗号分隔，`*` 全放 |
| `DATABASE_URL` | `postgres://polygoal:polygoal@127.0.0.1:5432/polygoal` | API + indexer + seed 共享 |

执行流程：

1. `rsync` 当前仓库到 `${DEPLOY_HOST}:${REMOTE_DIR}`，排除 `node_modules`、`.next`、`.git`、`.env*`。
2. SSH 调用 `scripts/deploy-vps-remote-provision.sh` 并把上面所有变量透传过去。

---

## 3. 远端 provision 做了什么

`scripts/deploy-vps-remote-provision.sh` 在 VPS 上顺序执行：

1. **系统包**：`apt-get install curl git nginx ufw ca-certificates`，按需安装 Node 20（NodeSource）与 Bun。
2. **防火墙**：`ufw` 放行 22 / 80 / 443。
3. **Swap**：分配 `/swapfile-polygoal` 4G 并写入 `/etc/fstab`，避免 1 GB 内存 VPS 在 `next build` 阶段 OOM。
4. **依赖安装**：`bun install`。
5. **Postgres 种子**：以 `DATABASE_URL` 运行 `bun packages/db/src/seed.ts`，重放 `001_mvp_schema.sql` 并写入 demo fixture / market / odds，幂等。
6. **前端构建**：`cd apps/web && NODE_OPTIONS=--max-old-space-size=2048 bun run build`，把 `NEXT_PUBLIC_*` 注入产物。
7. **systemd 单元**（按依赖顺序）：
   - `polygoal-indexer.service` — `bun x ponder start --schema ponder`，环境包含 `DATABASE_URL` / `DATABASE_SCHEMA=ponder` / `PONDER_RPC_URL` / `PONDER_START_BLOCK`。
   - `polygoal-api.service` — `bun src/server.ts` (apps/api)，环境包含 `API_HOST/PORT/CORS_ALLOWED_ORIGINS/DATABASE_URL/PONDER_SCHEMA=ponder`。`After=` 链了 indexer，但 API 在 `ponder` schema 还没就绪时会自动 fallback 到 Postgres。
   - `polygoal-web.service` — `node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000`，环境包含 `INTERNAL_API_URL`。**不能用 `bun start`**：Bun + Next 16 RSC streaming 会触发 `controller[kState].transformAlgorithm` 崩溃。
8. **nginx**：写入 `/etc/nginx/sites-available/polygoal.conf`（见下方），删除 `default` site，`nginx -t && systemctl reload nginx`。
9. **启动**：`systemctl enable --now polygoal-indexer polygoal-api polygoal-web`。
10. **Smoke**：分别 `curl /health`（直连 API）和 `/api/health`（经 nginx）。

### 3.1 nginx 配置

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    client_max_body_size 4m;

    # Same-origin API → bypass CORS + Chrome PNA.
    # Browser hits /api/foo, nginx forwards to 127.0.0.1:8787/foo (strip prefix).
    location /api/ {
        proxy_pass http://127.0.0.1:8787/;
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

---

## 4. 前置要求 / 准备工作

1. **VPS**：Ubuntu 22.04+，至少 1 GB RAM（脚本会自动建 4 GB swap）、Node 20 自动安装、root SSH key 登录已通。
2. **Postgres**：脚本默认假设 VPS 本机已有 `polygoal` 库 + `polygoal` 用户监听 `127.0.0.1:5432`，对应 `DATABASE_URL` 默认值。也可改 `DATABASE_URL` 指向托管实例。
3. **X Layer 部署**：`deployments/xlayer-testnet.json` 是 source of truth。当 infra 重新部署时：
   ```bash
   bun run deploy:xlayer:infra      # 部署 MockUSDC / CTF / Oracle / Factory
   bun run deploy:xlayer:markets    # 批量创建 48 场小组赛 match_winner 市场
   ```
   把新地址同步到 `deploy-vps-ip-http.sh` 的默认值或环境变量后再跑部署脚本。
4. **operator demo 数据**（可选）：
   ```bash
   bun run seed:demo-portfolio      # 给指定钱包注入持仓 / 历史
   ```

---

## 5. 部署后验证

### 5.1 命令行

```bash
# 浏览器同源访问
curl -i http://YOUR_HOST/api/health
curl -i http://YOUR_HOST/api/markets?status=open
curl -i http://YOUR_HOST/api/commercial-markets?marketType=match_winner | head -40
curl -i http://YOUR_HOST/                # 首页 HTML

# VPS 上服务状态
systemctl status polygoal-indexer.service
systemctl status polygoal-api.service
systemctl status polygoal-web.service
nginx -t

# 实时日志
journalctl -u polygoal-indexer -f      # Ponder 索引进度
journalctl -u polygoal-api -f
journalctl -u polygoal-web -f
```

### 5.2 浏览器

- `/` 首页展示 X Layer Testnet 部署的 World Cup 2026 小组赛 `match_winner` 市场，按比赛日分组。
- `/markets/[marketId]` 同屏挂载 match_winner / exact_score 两个 tab，链上 close time + provider odds + 持仓历史都可见。
- `/matches/[fixtureId]` 是 fixture 视角的快捷入口，自动跳到对应市场详情。
- `/portfolio` 在连接钱包后通过 `/api/portfolio/:wallet` 拉数据；`ponder` schema 就绪后会自动叠加链上 trade / redemption 记录。
- `/settlements` 通过 `/api/settlements?status=` 时间线展示 propose → challenge → finalize。
- `/operator` 在浏览器附带 `ADMIN_API_TOKEN` 时可执行 admin 操作。

### 5.3 Ponder 索引进度

Ponder 从 `PONDER_START_BLOCK`（默认 `30743211`，即 infra 部署区块）开始回放。初次部署需要扫几千个 block，过程中 `/api/portfolio` 可能短暂落到 Postgres fallback。`journalctl -u polygoal-indexer -f` 会持续打印 `Synced block ...`，追到 head 后即可在 `/portfolio` 和 `/settlements` 看到真链上数据。

---

## 6. DNS / TLS（可选）

只用 IP 上线时跳过本节。要绑域名 + HTTPS：

1. NameSilo / Cloudflare 等给 `www`（或 `@`）添 A 记录指向 VPS。
2. VPS 上执行：
   ```bash
   apt-get install -y certbot python3-certbot-nginx
   certbot --nginx -d your-domain.com -d www.your-domain.com
   ```
3. Certbot 会自动改 `polygoal.conf` 加 `listen 443 ssl` + 证书路径，并写 cron 自动续期。
4. 重跑 `deploy-vps-ip-http.sh`，设置 `CORS_ALLOWED_ORIGINS=https://your-domain.com`，并把前端 `NEXT_PUBLIC_API_URL=/api` 保持不变。

---

## 7. CORS / PNA / 常见坑

- **同源策略是默认值**：不要在生产前端写 `localhost` 作为 API 地址，也不要直接 `fetch("http://VPS_IP:8787/...")`，会同时触发 CORS 和 PNA 拦截。
- **CORS allowlist**：API 通过 `CORS_ALLOWED_ORIGINS` 控制白名单（逗号分隔），`*` 等价全放。生产建议显式列举。
- **PNA 兜底**：`apps/api/src/app.ts` 会在 OPTIONS preflight 上应答 `Access-Control-Allow-Private-Network: true`，覆盖那些（不该但仍然）跨私网请求的客户端。
- **`NEXT_PUBLIC_RPC_URL` 必须公网可达**：默认 `https://testrpc.xlayer.tech/terigon`，绝不要换成 `http://localhost:8545`。
- **`docs/deploy-scheme-a-public-frontend-local-api.md` 不要写真实秘钥**：`PRIVATE_KEY_OPERATOR` / `ADMIN_API_TOKEN` 只在 `.env`（已被 `.gitignore`）和 systemd `EnvironmentFile=` 里出现。

---

## 8. 常见故障

| 现象 | 排查 |
| --- | --- |
| `next build` 卡住后 OOM | 确认脚本里 swap 已生效 (`swapon --show`)，必要时把 `NODE_OPTIONS=--max-old-space-size=1536` |
| `polygoal-web` 启动几秒后崩溃，日志含 `controller[kState].transformAlgorithm` | 你又把 ExecStart 换回 `bun run start` 了 — Next 16 RSC streaming 在 Bun 上崩，必须用 Node 20 跑 `next start` |
| `/api/health` 200 但 `/api/markets` 500 | 检查 `DATABASE_URL` 是否正确、`polygoal` 库是否被 seed (`bun packages/db/src/seed.ts`) |
| `/portfolio` 长时间为空 | 等 `polygoal-indexer` 追上 X Layer head；API 会自动 fallback 到 Postgres 视图 |
| 浏览器 console 报 PNA | URL 里出现 `localhost` 或 `127.0.0.1`，前端构建时 `NEXT_PUBLIC_API_URL` 被错误覆盖 |
| nginx 502 | upstream 服务挂了，`systemctl status polygoal-{api,web}` |
| `ufw` 拒掉 22 端口把自己锁了 | 用 VPS 控制台 console 登录，`ufw allow OpenSSH && ufw reload` |

---

## A1（Fallback）原方案：Cloudflare Tunnel / ngrok 暴露 API

只在 **VPS 上不允许跑 API** 时使用。这种情况下浏览器直接访问 `https://api.example.com`，CORS 必须显式打开。

1. 域名托管在 Cloudflare → Cloudflare Tunnel：`api.example.com → http://localhost:8787`。
2. 或 ngrok：`ngrok http 8787`，记下 `https://xxxx.ngrok-free.app`。
3. 前端构建时把 `NEXT_PUBLIC_API_URL` 写成对应 HTTPS URL：
   ```bash
   cd apps/web
   NEXT_PUBLIC_API_URL=https://api.example.com bun run build
   ```
4. VPS 上仍然跑 `polygoal-web.service`，但 nginx 不再代理 `/api`。
5. 把前端域名加入 `CORS_ALLOWED_ORIGINS`（`apps/api/src/env.ts`），并重启 API。

> ⚠️ 隧道常驻 + DNS / 证书运维成本远高于同源方案；CORS / PNA 问题也会回来。仅在 VPS 无法承载 API 时启用。

---

## 9. 相关文件

| 文件 | 作用 |
| --- | --- |
| `scripts/deploy-vps-ip-http.sh` | 本机入口，定义所有 env 并 rsync + SSH |
| `scripts/deploy-vps-remote-provision.sh` | VPS 端 provisioning：apt / swap / bun / node / seed / build / systemd / nginx / smoke |
| `apps/web/next.config.ts` | 本地开发 `/api/:path*` rewrites（与 nginx 行为对齐）|
| `apps/web/lib/api-client.ts` | 前端 fetch 入口，统一用 `NEXT_PUBLIC_API_URL` |
| `apps/api/src/app.ts` | CORS + PNA 兜底 + 路由注册 |
| `apps/api/src/env.ts` | 解析 `CORS_ALLOWED_ORIGINS` / `API_HOST` / `API_PORT` |
| `apps/api/src/services/ponder-reader.ts` | 从 `ponder.*` schema 叠加链上索引数据，支持 fallback |
| `apps/indexer/ponder.config.ts` | Ponder 0.16 配置：X Layer + Factory / Market / Oracle |
| `apps/indexer/ponder.schema.ts` | indexed 表：`market` / `trade` / `redemption` / `result_proposal` / `position` |
| `deployments/xlayer-testnet.json` | 当前 infra + 48 场 match_winner 市场的真值 |
| `packages/db/migrations/001_mvp_schema.sql` | 合并后的 Postgres schema（fixtures / markets / odds / audit / runtime） |
| `packages/db/src/seed.ts` | demo 数据 + 幂等初始化 |
