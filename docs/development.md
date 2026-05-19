# 2026 世界杯 EVM 预测市场开发文档

## 1. 技术栈约定

本项目采用 monorepo 多包架构。商业主线是「胜负 + 比分」两类世界杯市场（`match_winner` / `exact_score`），架构同时支持本地 Anvil、X Layer Testnet、staging 和生产环境；代码结构不能只服务 demo，而要满足可运营、可监控、可审计、可扩展的商业版本要求。

核心技术栈：

- 前端：Next.js 15（App Router）、React 19、TypeScript、Tailwind CSS v4、HeroUI v3（`@heroui/react` + `framer-motion`）。设计 token 集中在 `app/globals.css`（含 HeroUI 主题变量覆盖：`--accent / --success / --warning / --danger / --focus / --radius` 全部对齐品牌绿 `#05b34f`）。UI 原子放 `apps/web/components/ui/`，业务组件按 `markets/` `matches/` `portfolio/` `settlements/` `operator/` `wallet/` 分组。所有 "卡片型" 容器统一使用 HeroUI `<Card>`（含 `Card.Header / Card.Content / Card.Footer` 三段），状态徽标使用 HeroUI `<Chip>`；自定义 `.button` / `.skeleton` 与品牌动画因为命名冲突保留。
- 后端：Bun + Hono + TypeScript。
- 数据库：Postgres（带 in-memory facade，便于本地、CI 和无 DB 演示）。
- 链上交互：viem。
- 数值计算：decimal.js。
- 链上索引：Ponder 0.16。
- 合约：Solidity 0.8.x、Foundry、Anvil（本地）/ X Layer Testnet（远端）。
- API 文档：OpenAPI + 静态 HTML index（`/docs` 输出指引，`/openapi.json` 输出 spec）。
- 环境变量：dotenv（同时被 Bun、Foundry 脚本和 Next 加载，见 `apps/web/next.config.ts::loadRootEnv`）。
- 远程隧道：ssh2（可选）。
- 本地脚本：tsx / `bun scripts/*.ts`。

后端依赖版本固定为：

```json
{
  "decimal.js": "^10.6.0",
  "dotenv": "^17.4.2",
  "hono": "^4.12.18",
  "ponder": "^0.16.6",
  "postgres": "^3.4.7",
  "ssh2": "^1.17.0",
  "swagger-ui-dist": "^5.32.6",
  "tsx": "^4.21.0",
  "viem": "^2.48.11"
}
```

## 2. Monorepo 目录结构

```text
polygoal/
  apps/
    web/
      app/                  Next App Router（page.tsx / loading.tsx + 子路由）
      components/
        ui/                 设计系统原子：PageHero / StatCard / DayJumper / Skeleton / DataFreshnessBadge / DeviationBadge / TxStatusBadge / EmptyState / SiteNavigation / NavigationProgress / BrandMark
        matches/            FixtureHero / FixtureRow / MatchEventsList
        markets/            FixtureMarketView / OutcomeCard / TradeTicket / SettlementRules
        portfolio/          PortfolioPageClient / PortfolioSummary / PositionGroup / PositionRow / BalanceFaucet
        settlements/        SettlementsClient / SettlementGroup / SettlementRow
        operator/           OperatorConsole
        wallet/             WalletProvider / WalletPill
      lib/                  api-client / wallet / teams / market-copy / outcome-colors / demo-data
      next.config.ts        加载 root .env 并把 /api/* rewrite 到 INTERNAL_API_URL
      heroui.d.ts           HeroUI 样式 side-effect import 的 TypeScript module 声明
      postcss.config.mjs    PostCSS 注册 `@tailwindcss/postcss`，供 Tailwind v4 处理 HeroUI 的 `@apply`
    api/
      src/
        app.ts              Hono app 工厂；注册 health / public / admin / commercial / docs 路由
        env.ts              API_HOST / API_PORT / CORS_ALLOWED_ORIGINS
        routes/
          health.ts
          public.ts         schedule / fixtures / events / commercial-markets / live-windows / markets / odds / settlements / data-quality
          admin.ts          sync / data-quality / live-window / markets / results / seed
          commercial.ts     market-types / feature-flags / risk / provider-health / portfolio / pause / refund / challenges / audit-logs
          docs.ts           OpenAPI JSON + 简易 HTML index
        services/
          app-context.ts          组装 db + ponder reader
          market-type-service.ts  match_winner / exact_score 定义
          risk-service.ts         订单风控判定
          provider-health-service.ts
          audit-service.ts
          operator-service.ts
          ponder-reader.ts        从 Ponder schema 读取 trade / market / result_proposal
          errors.ts               统一 ApiError + errorBody
        openapi/spec.ts
    indexer/
      ponder.config.ts      X Layer chain + factory / market / oracle 合约定义
      ponder.schema.ts      market / trade / redemption / result_proposal / position 五张 onchain table
      src/index.ts          事件处理器（MarketCreated / TradeExecuted / Redeemed / Result* / MarketVoided）
      src/api/index.ts      Ponder HTTP API
      abis/                 forge 编译产物（4 份 JSON）
      legacy/               旧的 dev-loop + handler 仅供参考
      generated/schema.graphql
  contracts/
    foundry.toml
    src/
      MockUSDC.sol
      ConditionalTokensLite.sol
      WorldCupMarketFactory.sol
      WorldCupMarket.sol
      OptimisticResultOracle.sol
    script/
      Deploy.s.sol
      FullFlow.s.sol         Solidity-only 端到端流程脚本
    test/
      WorldCupLiveMarket.t.sol
  deployments/
    xlayer-testnet.json     infra + 已部署的 match_winner 市场（48 组小组赛）
  packages/
    config/                  链 / 合约 / 市场配置
    db/
      migrations/001_mvp_schema.sql   全部合并到单文件（含 商业 / odds / risk / audit 表）
      src/                            client / postgres-db / postgres-flow / repository / seed
      test/                           schema / commercial / odds-schema / postgres-real
    odds-ingestion/
      src/
        providers/
        normalizers/
        compare.ts
        index.ts
    sdk/
      src/                            api / chain / markets / types
    shared/
      src/
        types.ts                      domain 类型
        constants.ts
        commercial.ts                 商业市场定义、outcome map
        deployments.ts                XLayer infra/markets helper（getXLayerInfraDeployment、getXLayerMarketDeployment、computeMatchWinnerMarketKey、...）
        worldcup-2026-schedule.ts     WORLDCUP_2026_GROUP_STAGE_FIXTURES + 队伍列表
        commercial-resolution.ts      胜负 / 比分结算 helper
        index.ts
  scripts/
    contracts-full-flow.ts
    deploy-xlayer-infra.ts
    deploy-xlayer-markets.ts
    deploy-vps-ip-http.sh
    deploy-vps-remote-provision.sh
    seed-demo-portfolio.ts
    test-e2e-anvil.ts
    test-commercial-matrix.ts
    test-security.ts
    test-performance.ts
    test-postgres-real.ts
    full-flow-test-report.ts
    pg-backup.ts
    review-fix.ts
  docs/
    worldcup-2026-evm-prediction-market.md
    match-winner-first-requirements.md
    development.md
    testing.md
    data-sources.md
    resolution-rules.md
    deploy-scheme-a-public-frontend-local-api.md
  bun.lock
  tsconfig.base.json
  .env.example
```

## 3. 包职责划分

### 3.1 `apps/web`

Next.js 前端。

页面（App Router）：

- `/`：首页，按日期分组展示 World Cup 2026 赛程；顶部聚合 live matches；每张 `FixtureRow` 显示 `match_winner` / `exact_score` 是否可交易。
- `/markets/[marketId]`：胜负 + 比分市场详情；`FixtureMarketView` 同时挂载 match_winner / exact_score 两个产品 tab，并把交易、持仓、事件流、结算规则放在同一屏。
- `/matches/[fixtureId]`：比赛 URL alias，server redirect 到 `/markets/{fixtureId}:match_winner`。
- `/portfolio`：钱包持仓 + 余额 + 测试网 faucet；首选 Ponder 索引器（真链上数据），回退 in-memory。
- `/settlements`：按 proposed / challenged / finalized / voided 分组的结算时间线。
- `/operator`：运营控制台，仅在 `NEXT_PUBLIC_OPERATOR_CONSOLE_ENABLED=true` 时挂载。

UI 约定：

- 设计 token 集中在 `app/globals.css`。
- 业务组件按业务域命名（不再使用 `live/`、`schedule/` 这种基于「时段」的目录）。
- 钱包连接由 `WalletProvider` 提供，client component；其他能 SSR 的页面优先 `dynamic = "force-dynamic"` + server fetch。
- 任何链上交易按钮必须经过 `TradeTicket` 状态机：idle → needs-approval → pending-signature → pending-tx → indexed / failed。
- 所有响应式断点用 Tailwind 标准 token；H5 视觉问题由 `bun run test:web:responsive` 守护。

### 3.2 `apps/api`

Bun + Hono API。

中间件：requestId → CORS → routes → notFound → onError；CORS allow list 由 `CORS_ALLOWED_ORIGINS` 控制（逗号分隔，`*` 表示全开）。

路由总览：

```text
GET  /health
GET  /teams
GET  /schedule
GET  /fixtures?status=
GET  /fixtures/:fixtureId/events
GET  /data-quality/fixtures/:fixtureId
GET  /live-windows?status=
GET  /markets?status=
GET  /markets/:marketId
GET  /commercial-markets?fixtureId=&marketType=
GET  /market-types
GET  /odds/markets/:marketId
GET  /odds/fixtures/:fixtureId
GET  /settlements?status=
GET  /portfolio/:walletAddress
GET  /admin/feature-flags
GET  /admin/audit-logs
POST /admin/sync/{fixtures,teams,rankings,live-events,odds}
POST /admin/data-quality/{fixtures/compare,fixtures/inject-mismatch,live-events/compare}
POST /admin/odds/compare
POST /admin/live-windows/create
POST /admin/markets/create
POST /admin/markets/bootstrap-schedule
POST /admin/markets/commercial
POST /admin/markets/:marketId/{pause,resume,void,refund}
POST /admin/challenges
POST /admin/challenges/:challengeId/review
POST /admin/results/{propose,finalize,seed-demo}
POST /admin/portfolio/seed-position
POST /admin/live/seed-events
POST /admin/feature-flags/:flag
POST /admin/risk/limits
POST /admin/provider-health
POST /admin/provider-health/auto-pause
POST /risk/check
GET  /openapi.json
GET  /docs
```

错误统一：

```json
{ "error": { "code": "MARKET_NOT_FOUND", "message": "Market not found", "details": {} } }
```

### 3.3 `apps/indexer`

Ponder 0.16。

配置（`ponder.config.ts`）：

- 链：`xlayer`（id = 1952），RPC 默认读 `PONDER_RPC_URL` → `NEXT_PUBLIC_RPC_URL` → `RPC_URL` → `https://testrpc.xlayer.tech/terigon`。
- 合约：`WorldCupMarketFactory`、`WorldCupMarket`（factory pattern，从 `MarketCreated.market` 字段订阅 clone）、`OptimisticResultOracle`。
- 起始 block：默认 `30_743_211`（factory 部署 tx 所在 block），可用 `PONDER_START_BLOCK` 覆盖。
- 数据库：`DATABASE_URL` 存在用 Postgres，否则使用本地 pglite。

Schema（`ponder.schema.ts`）：

- `market`：`marketId(pk) marketAddress marketKey fixtureId windowStart/EndMatchSecond conditionId outcomeCount createdBlock createdTxHash createdAt`。
- `trade`：`id(=txHash:logIndex,pk) marketId marketAddress trader outcomeIndex collateralAmountRaw sharesAmountRaw tradeType blockNumber blockTimestamp txHash logIndex`。
- `redemption`：`id marketId marketAddress user outcomeIndex sharesBurnedRaw collateralPaidRaw blockNumber blockTimestamp txHash logIndex`。
- `resultProposal`：单条 per `marketId`，状态机覆盖 `proposed / challenged / finalized / voided` 四种 transition。
- `position`：每 `(marketAddress, trader, outcomeIndex)` 聚合 net shares、累计 collateral in/out、redeemed；避免 API 每次重算。

事件处理（`src/index.ts`）：

- `Factory:MarketCreated` → 写入 `market`。
- `Market:TradeExecuted` → upsert `position`，append `trade`。
- `Market:Redeemed` → append `redemption`，更新 `position.sharesRaw / redeemedRaw`。
- `Oracle:ResultProposed | ResultChallenged | ResultFinalized | MarketVoided` → upsert `resultProposal`，最后状态胜出。

重放策略：

- 本地开发可直接清空 Ponder schema 后重启。
- 测试网 / 生产环境通过修改 `PONDER_START_BLOCK` 做窗口回放，不要随意 drop 表。

### 3.4 `contracts`

Foundry。要求合约可升级到 UMA Optimistic Oracle + Gnosis CTF，但当前以 ConditionalTokensLite + OptimisticResultOracle 为主。

合约：

- `MockUSDC.sol`：测试抵押资产（6 decimals + 公开 mint）。
- `ConditionalTokensLite.sol`：ERC1155，按 `conditionId / outcomeIndex` 生成 token id，提供 prepare / split / merge / redeem。
- `WorldCupMarketFactory.sol`：按 `market_key` 唯一性创建 clone。`MarketCreated` 事件包含 `marketId / marketKey / fixtureId / windowStart / windowEnd / market / conditionId / outcomeCount` 八个字段。
- `WorldCupMarket.sol`：处理买 / 卖 / 赎回；价格曲线在小 outcomeCount 上同时支持二元 (Yes/No goal-window 旧路径) 与 3 outcome (match_winner)。
- `OptimisticResultOracle.sol`：propose → challenge → finalize / void。`ResultProposed` 事件包含 `marketId / proposalId / proposer / winningOutcome / payloadHash / challengeDeadline`。

### 3.5 `packages/db`

单一 migration `001_mvp_schema.sql` 已合并历史四份 migration；包含商业 / odds / risk / audit / feature_flag / refund 全部表。客户端：

- `src/client.ts` 暴露 `sql` postgres client，按 `DATABASE_URL` 是否非空选择 Postgres 或 in-memory。
- `src/postgres-db.ts` / `postgres-flow.ts`：真实 Postgres facade；in-memory 路径放 `src/repository.ts`。
- `src/seed.ts`：seed demo fixture + match_winner / exact_score outcomes。

幂等键（必须）：

- fixture：`fifa_match_id`
- event：`fixture_id + provider_event_id`
- live window：`window_key`
- market：`market_key`（链上 `fixture:<id>:<type>`，DB 同步存）
- result proposal：`market_id + payload_hash`
- indexed event：`chain_id + tx_hash + log_index`

金额一律使用 string 存最小单位（`amount_raw / shares_raw / collateral_raw`），数据库不存 JS number。

### 3.6 `packages/sdk`

- `chain.ts`：viem public + wallet client（带 X Layer + Anvil 链定义）。
- `markets.ts`：报价、深度、滑点。
- `api.ts`：API client 封装。

### 3.7 `packages/shared`

- `types.ts` / `constants.ts`：domain 类型与常量。
- `commercial.ts` / `commercial-resolution.ts`：商业市场定义和结算判定（含胜负 / 比分逻辑）。
- `deployments.ts`：X Layer infra/markets helper，支持 `getXLayerMarketDeployment(marketKey)`。
- `worldcup-2026-schedule.ts`：48 队 + 小组阶段 fixture list，是 `deploy-xlayer-markets.ts` 的输入。
- `index.ts`：re-export。

### 3.8 `packages/config`

链定义、合约地址、ABI 路径、默认市场参数（窗口长度、close buffer、challenge window）。

## 4. 环境分层

| 环境 | 链 | 合约 | 数据源 | Oracle | 部署脚本 |
| --- | --- | --- | --- | --- | --- |
| local | Anvil 31337 | `forge script Deploy.s.sol` | demo snapshot | local oracle | `bun run deploy:local` |
| dev preview | X Layer Testnet 1952 | `deployments/xlayer-testnet.json` | demo / 真 provider 混合 | `OptimisticResultOracle` | `bun run deploy:xlayer:*` |
| staging | 商业链 | 多签 + adapter | production-like provider | UMA / adapter rehearsal | TBD |
| production | 合规链 | 多签 + audit | multi-provider + FIFA official | UMA / CTF + fallback | TBD |

每个环境必须有独立：RPC、合约地址、数据库、API key、provider 配置、feature flag、监控、管理员权限。

## 5. 本地开发服务

最少四个进程：

```bash
bun run dev:anvil      # 31337
bun run dev:api        # 8787
bun run dev:web        # 3000
bun run dev:indexer    # Ponder
```

数据库可选：

```bash
docker run --name polygoal-postgres \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=polygoal \
  -p 5432:5432 -d postgres:16
bun run db:migrate
bun run db:seed
```

如果不启 Postgres，API 自动回退到 in-memory；前端、Ponder 仍能跑起来（Ponder 落 pglite）。

端口：

- Web：`http://localhost:3000`
- API：`http://localhost:8787`（Swagger HTML 在 `/docs`，OpenAPI JSON 在 `/openapi.json`）
- Anvil RPC：`http://localhost:8545`
- Postgres：`localhost:5432`

## 6. Root scripts 约定

参考 `package.json` 实际定义。常用：

```bash
bun run dev:web | dev:api | dev:indexer | dev:anvil

bun run deploy:local                  # forge Deploy.s.sol 到本地
bun run deploy:xlayer:infra           # 部署 X Layer infra
bun run deploy:xlayer:markets         # 部署 X Layer match_winner 市场

bun run db:migrate
bun run db:seed                       # 等价 packages/db seed:test
bun run db:backup                     # pg_dump → BACKUP_DIR/polygoal-*.dump

bun run lint | lint:web | lint:api
bun run typecheck | typecheck:web | typecheck:api | typecheck:indexer | typecheck:packages
bun run test                          # contracts + ts
bun run test:contracts
bun run test:ts                       # bun test packages apps scripts
bun run coverage | coverage:contracts | coverage:ts
bun run test:web:responsive
bun run test:e2e:anvil
bun run test:postgres
bun run test:commercial-matrix | test:security | test:performance
bun run contracts:flow                # solidity 端到端
bun run test:report                   # 汇总报告

bun run seed:demo-portfolio --wallet=0x...
bun run review-fix                    # 自动跑 review-fix 循环辅助脚本
bun run openapi                       # 生成 OpenAPI spec
```

## 7. 环境变量

根目录 `.env`，模板 `.env.example`：

```bash
# App
NODE_ENV=development

# Web — browser-facing API base
# 推荐：同源 /api 路径（nginx 反代或 next.config.ts rewrite 转发）
NEXT_PUBLIC_API_URL=/api
# SSR / route handler 用，绕过浏览器直接走 loopback
INTERNAL_API_URL=http://127.0.0.1:8787
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://localhost:8545
NEXT_PUBLIC_MOCK_USDC_ADDRESS=
NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=
NEXT_PUBLIC_ORACLE_ADDRESS=
NEXT_PUBLIC_CTF_ADDRESS=

# API
API_HOST=0.0.0.0
API_PORT=8787
# 允许的浏览器 Origin，逗号分隔；* 表示全开
CORS_ALLOWED_ORIGINS=*
DATABASE_URL=postgres://postgres:postgres@localhost:5432/polygoal
BACKUP_DIR=./backups/pg
BACKUP_RETENTION_DAYS=14

# Chain
CHAIN_ID=31337
RPC_URL=http://localhost:8545
PRIVATE_KEY=
MOCK_USDC_ADDRESS=
MARKET_FACTORY_ADDRESS=
ORACLE_ADDRESS=
CTF_ADDRESS=

# Sports data
SPORTS_DATA_PROVIDER=demo
SPORTS_DATA_API_BASE_URL=
SPORTS_DATA_API_KEY=

# Odds
ODDS_DATA_PROVIDERS=demo
ODDS_API_BASE_URL=
ODDS_API_KEY=
ODDS_STALE_AFTER_SECONDS=30
ODDS_WARNING_DEVIATION_BPS=500
ODDS_CRITICAL_DEVIATION_BPS=1500

# Live window (历史 goal-window 路径仍在 contracts/test 用)
LIVE_WINDOW_SECONDS=600
LIVE_WINDOW_CLOSE_BUFFER_SECONDS=30
LIVE_EVENT_CONFIRMATION_DELAY_SECONDS=120
CHALLENGE_WINDOW_SECONDS=600

# Ponder 索引
PONDER_RPC_URL=
PONDER_START_BLOCK=

# SSH tunnel（可选）
SSH_TUNNEL_ENABLED=false
SSH_TUNNEL_HOST=
SSH_TUNNEL_PORT=22
SSH_TUNNEL_USERNAME=
SSH_TUNNEL_PRIVATE_KEY_PATH=
SSH_TUNNEL_REMOTE_HOST=
SSH_TUNNEL_REMOTE_PORT=
SSH_TUNNEL_LOCAL_PORT=
```

`apps/web/next.config.ts` 启动时调用 `loadRootEnv()`，按 `.env` → `.env.<NODE_ENV>` → `.env.local` 顺序载入项目根目录配置，使 Next dev / build / start 不需要再复制一份。

## 8. 后端模块细节

### 8.1 Hono app

`apps/api/src/app.ts`：

- 注入 `AppContext`（db + 可选 PonderReader）。
- 注册 CORS（按 `CORS_ALLOWED_ORIGINS` 收紧）。
- 注入 Chrome Private Network Access 响应头（`Access-Control-Allow-Private-Network: true`，浏览器从公网 origin 调本地服务的 preflight 需要）。
- 统一 `notFound` 与 `onError`。

### 8.2 PonderReader

`apps/api/src/services/ponder-reader.ts` 在 API 启动时检测 `ponder.trade` 表是否存在；存在时把 schema search_path 固定到 `ponder`，按需提供：

- `listTradesForWallet(wallet)`：`/portfolio/:wallet` 拿到真链上交易；为空才回退 in-memory（防止 admin/seed-position 污染真实数据）。
- `getMarketStatusOverlay(marketId)`：把 oracle proposed / challenged / finalized / voided 状态叠加到 `/markets/:id`。
- `listSettlements(status?)`：`/settlements` 直读 indexer 表。

### 8.3 decimal.js 使用边界

`decimal.js` 用于：

- AMM quote 预估。
- 前端 / API 展示 implied probability。

链上金额仍使用 bigint：

- viem 写合约用 bigint。
- 数据库存最小单位 string。
- API response 字段一律提供 `xxxRaw`（string），需要展示时由前端按 decimals 格式化。

### 8.4 viem 使用边界

`viem` 用于：

- 创建 public client / wallet client（含 X Layer + Anvil chain 定义）。
- 读合约状态。
- 写市场创建、result proposal、finalize。
- 解析交易 receipt 与事件。

后端管理员操作走单个私钥（`PRIVATE_KEY`），用户交易在前端由用户钱包签名。

### 8.5 真实盘口数据接入

商业版本必须从专业 provider 拉取真实盘口数据：

- `match_winner`：1X2 / moneyline。
- `exact_score`：correct score / exact score。
- 旧的 goal-window 仍可继续保留接入（合约和结算服务未删），但 UI 不再暴露。

接口：

- `GET /odds/markets/:marketId`
- `GET /odds/fixtures/:fixtureId`
- `POST /admin/sync/odds`
- `POST /admin/odds/compare`

`packages/odds-ingestion` 提供 `providers/` `normalizers/` `compare.ts`。落库时必须保存 raw payload、provider timestamp、ingested timestamp、bookmaker、payload hash；任何 stale / outlier 触发风控信号。

### 8.6 Postgres 使用边界

- `packages/db/src/client.ts` 暴露 `sql` client。
- API 和索引器**不**各自创建 schema；API 用 `packages/db` 的 migration，Ponder 用自己的 `ponder` schema，互不污染。
- 所有写入幂等。

### 8.6.1 数据库备份与恢复（生产必备）

商业 / 预生产 Postgres 多层备份：

1. **托管数据库自动备份**：RDS / Cloud SQL / Supabase / Neon 等开启连续归档 + PITR + ≥ 7 天保留。
2. **逻辑备份（`pg_dump`）**：`bun run db:backup` → `BACKUP_DIR/polygoal-*.dump`（custom format）。
3. **对象存储归档**：把 dump 同步到另一区域 S3 / GCS / R2，开启版本控制 / Immutable。
4. **演练**：每季度至少一次从备份恢复 → 重跑 `db:migrate` → 抽检查询。

恢复示例：

```bash
pg_restore --clean --if-exists --no-owner --no-acl \
  -d "$DATABASE_URL" ./backups/pg/polygoal-YYYYMMDDTHHMMSSZ.dump
```

`backups/` 已加入 `.gitignore`，禁止把含机密的连接串与备份文件提交。

### 8.7 ssh2 使用边界

仅用于可选远程隧道（远程 Postgres / RPC / 私有 sports data endpoint），默认不启用。

### 8.8 OpenAPI 与文档

API 提供：

- `GET /openapi.json`
- `GET /docs`（轻量 HTML index，指向 OpenAPI JSON；`swagger-ui-dist` 资源按需挂载）

OpenAPI spec 在 `apps/api/src/openapi/spec.ts` 维护。

## 9. 合约开发

### 9.1 Foundry

`contracts/foundry.toml` 默认 profile + coverage profile（启用 `--ir-minimum`）。

### 9.2 本地链

```bash
anvil --chain-id 31337 --host 0.0.0.0 --port 8545
forge script contracts/script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

一键端到端（不依赖外部 Anvil 守护进程）：

```bash
bun run contracts:flow
```

`scripts/contracts-full-flow.ts` 会启动短生命周期 Anvil、部署合约、跑出 trade / propose / finalize / redeem 全流程，方便在 CI 里跑。

### 9.3 X Layer Testnet 部署

```bash
PRIVATE_KEY=0x... bun run deploy:xlayer:infra
PRIVATE_KEY=0x... bun run deploy:xlayer:markets
```

两个脚本都会把结果写回 `deployments/xlayer-testnet.json`；前端、Ponder 配置、API 都直接读这份 JSON（`packages/shared/src/deployments.ts`）。

### 9.4 合约测试重点

- 创建 match_winner / 比分 / goal_window 市场。
- 重复 `market_key` 创建失败。
- 窗口或 close time 之后禁止交易。
- propose result 必须引用有效 market。
- challenge window 结束前不能 finalize。
- 胜出 outcome 可赎回，失败 outcome payout 为 0。
- void 后退款不影响已 finalized 交易。

## 10. 数据库开发

### 10.1 商业核心表（`001_mvp_schema.sql` 已合并）

```text
teams, fixtures, match_events,
live_windows, markets, market_outcomes,
trades, result_proposals, challenges, redemptions, indexed_blocks,
data_source_snapshots, data_comparisons,
operator_actions, risk_limits, market_pauses, refunds,
liquidity_snapshots, odds_snapshots, odds_comparisons,
provider_health_checks, audit_logs, feature_flags
```

### 10.2 金额字段

所有链上金额字段使用 `text` 存最小单位：

- `amount_raw`
- `shares_raw`
- `collateral_raw`
- `price_bps`（整数 bps，用 int 即可）

### 10.3 幂等键

见 §3.5。

## 11. 前端开发

### 11.1 设计系统

- 暗色优先，亮色保留切换。
- `app/globals.css` 集中 token；不在业务组件里写魔法值。同时在 `:root` 内覆盖 HeroUI 主题变量（`--accent / --success / --warning / --danger / --focus / --radius`）使其对齐品牌色，无需 per-component 配置。
- `components/ui/` 只放设计原子（BrandMark / Skeleton / DataFreshnessBadge / DeviationBadge / EmptyState / PageHero / StatCard / DayJumper / CountdownTimer / TxStatusBadge / SiteNavigation / NavigationProgress）。
- 业务组件按业务域分目录（不再使用 `live/`、`schedule/`、`settlement/` 单数命名）。
- 任何 "卡片型" 容器（看板项、列表项、可点击 tile、空态、faucet…）一律用 HeroUI `<Card variant="default">`，并尽量用 `<Card.Header>` / `<Card.Content>` / `<Card.Footer>` 三段拆结构；状态/计数徽标用 `<Chip size="sm" variant="soft" color="success | warning | danger">`。需要保留品牌色左侧条时用一个独立 `<span className="*-card-stripe" />` 子节点叠加。
- HeroUI v3 依赖 Tailwind v4 处理 `@apply`，所以 `apps/web` 必须保留 `tailwindcss@^4` + `@tailwindcss/postcss@^4` + `postcss.config.mjs`；HeroUI 的预编译样式通过 `import "@heroui/react/styles"`（在 `apps/web/app/layout.tsx` 顶部）注入，类型声明在 `apps/web/heroui.d.ts`。
- 仍保留的自定义类（命名冲突 / 已经品牌化）：`.button`、`.skeleton`、`.position-card-stripe`、`.settlement-card-stripe`、`.market-card-link`、`.outcome-card`。新增自定义类前必须确认不会和 HeroUI 生成的 class 冲突。

### 11.2 比赛胜负优先（match-winner-first）

按 `docs/match-winner-first-requirements.md`：

- 首页只展示比赛（不展示 goal window）。
- 市场详情默认问题是「谁赢」，3 选 1：Home / Draw / Away。
- 比分预测作为次级 tab（`Exact Score`），常见比分 + `Other score`。
- 移动端首屏先出比赛 + 比分 + 胜负 outcome。

### 11.3 状态映射

```text
scheduled    灰
live_trading 绿
closing_soon 黄
closed       灰
proposed     蓝
challenged   红
redeemable   紫
settled      灰
voided       橙红
```

### 11.4 页面数据来源

- 首页 / 详情页 / 持仓 / 结算：优先从 API 读取聚合数据。
- 钱包余额、allowance、shares balance、tx receipt 由前端 viem 直读链上。
- 持仓 + 结算时间线：API 内部已经在 Ponder 可用时直接读链上索引；UI 不感知差异。

## 12. Ponder 索引器开发

### 12.1 输入

- 合约地址来自 `deployments/xlayer-testnet.json`。
- ABI 在 `apps/indexer/abis/`（forge build 产物对应 JSON）。
- start block / RPC 由 `PONDER_START_BLOCK` / `PONDER_RPC_URL` 覆盖，否则用默认。

### 12.2 输出

- `market / trade / redemption / result_proposal / position` 五张 onchain table。
- Ponder schema 名固定为 `ponder`；API 通过 search_path 隔离。

### 12.3 重放策略

- 本地：drop ponder schema 后重启即可。
- X Layer / staging / production：通过修改 `PONDER_START_BLOCK` 做窗口回放，避免误删表。

## 13. 生产级服务能力

### 13.1 CI/CD

CI 必须包含：

- install / typecheck / lint。
- unit + integration tests。
- contract tests + Foundry gas snapshot + coverage gate ≥ 95%。
- ABI drift check（forge 编译产物 vs `apps/indexer/abis/*.json`）。
- OpenAPI diff check。
- DB migration dry-run。
- Frontend build。

CD 必须支持：

- staging 自动部署、production 手动批准。
- 合约部署多签确认。
- 合约地址变更回写到 `deployments/` 并自动跑 `bun run typecheck`。
- 回滚前端 / API / indexer。
- migration 备份和回滚策略。

### 13.2 可观测性

必须接入：

- structured logs、request id、trace id。
- metrics、uptime checks。
- provider health checks（`POST /admin/provider-health`）。
- indexer lag metrics（Ponder 自带）。
- transaction failure metrics。

关键指标：

- API p50/p95/p99 latency。
- API error rate。
- provider event delay。
- 市场创建失败次数。
- result proposal 延迟。
- indexer block lag。
- 钱包交易失败率。
- 数据 mismatch 数。
- redeem 失败率。

### 13.3 安全工程

- 管理员私钥不能直接放普通 `.env` 用于生产；走多签或 signer service。
- admin 路由必须有认证、授权和审计。
- market pause / void / finalize 一律写 audit log。
- dependency audit 进入 CI。
- 合约部署前必须有静态分析 + 人工 review；真实资产上线前必须完成外部审计。

### 13.4 商业配置中心 / feature flag

通过 `GET/POST /admin/feature-flags` 维护：

```text
enableRealCollateral
enableMatchWinnerMarket
enableExactScoreMarket
enableLiveGoalWindow         (旧的滚球，默认关闭)
enableNextGoalMarket
enablePublicChallenge
enableUmaAdapter
enableGeoBlock
enableTradingFees
```

按环境 / 市场 / 国家生效。

## 14. 开发顺序

1. 初始化 monorepo workspace。
2. 初始化 `contracts` Foundry 项目。
3. 编写 MockUSDC / ConditionalTokensLite / MarketFactory / Market / OptimisticResultOracle。
4. 编写 Foundry 测试 + `contracts:flow`。
5. 初始化 `packages/db`，跑 `001_mvp_schema.sql`，写 seed。
6. 初始化 `apps/api`，实现 Hono health / schedule / commercial-markets / markets / settlements。
7. 初始化 `apps/indexer`，监听合约事件写入 `ponder` schema。
8. 初始化 `apps/web`，先做首页 + 市场详情 + 钱包连接。
9. 接 viem 交易 + Ponder reader 驱动的真链上持仓。
10. 部署到 X Layer Testnet，跑通公开演示。
11. 端到端 demo：seed schedule → 部署 match_winner 市场 → buy / sell → propose → finalize → redeem。

## 15. 本地端到端流程

1. 启 Postgres（可选）。
2. `bun run db:migrate && bun run db:seed`。
3. `bun run dev:anvil`。
4. `bun run deploy:local` 或 `bun run contracts:flow`。
5. 把部署地址写入 `.env`（`MARKET_FACTORY_ADDRESS / ORACLE_ADDRESS / NEXT_PUBLIC_*`）。
6. `bun run dev:api`。
7. `bun run dev:indexer`。
8. `bun run dev:web`，打开 `http://localhost:3000`。
9. 选一场 demo fixture，进入 `/markets/{fixtureId}:match_winner`。
10. 用户 A 买 Home，用户 B 买 Draw，用户 C 买 Away。
11. `POST /admin/results/propose`。
12. 推进 Anvil 时间至 challenge deadline 后。
13. `POST /admin/results/finalize`。
14. 用户在 `/portfolio` redeem。

## 16. 商业验收标准

- Monorepo 能安装依赖。
- Web、API、Indexer、Anvil 能分别启动。
- Foundry 合约测试通过。
- API health check 通过。
- OpenAPI JSON / `/docs` 可访问。
- 数据库能 seed demo schedule。
- 可以创建 `match_winner` / `exact_score` 商业市场。
- 用户能用 Mock USDC（或测试网 USDC）买 outcome shares。
- close time 后禁止交易。
- 可 propose、challenge、finalize、redeem。
- 前端能展示完整状态流，比赛优先信息架构落地。
- 商业设计系统骨架完成。
- 数据源对比、市场暂停、审计日志、运营后台基础能力完成。
- CI 覆盖 typecheck / lint / tests / coverage / build。
- 合约 / 后端 / 前端覆盖率 ≥ 95%。
- staging 部署流程有文档和脚本。

## 17. 约束

- 第一条端到端路径以 match-winner-first 商业市场为主，goal-window 合约保留为底层能力，但 UI 不再暴露。
- local 使用 MockUSDC；testnet / staging / production 切换抵押资产策略。
- 不接真实博彩赔率作为自动结算依据；商业版本可展示第三方 odds 作为参考，必须标注来源、bookmaker、时间戳和延迟。
- 不把 JavaScript number 用作链上金额。
- 不让前端直接信任未确认的 live event 作为最终结果。
- 不在生产前端代码里写 `localhost`：浏览器统一走 `/api` 同源路径；SSR 用 `INTERNAL_API_URL`；详见 `docs/deploy-scheme-a-public-frontend-local-api.md`。
