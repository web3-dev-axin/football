# 2026 世界杯实时滚球预测市场开发文档

## 1. 技术栈约定

本项目采用 monorepo 多包架构，围绕“世界杯商业级实时滚球预测市场”构建。项目必须同时支持本地 Anvil 验证、测试网 beta、预生产和商业生产环境；代码结构不能只服务 demo，而要满足可运营、可监控、可审计、可扩展的商业版本要求。

核心技术栈：

- 前端：Next.js、React、TypeScript、shadcn/ui、Tailwind CSS。
- 后端：Bun、Hono、TypeScript。
- 数据库：Postgres。
- 链上交互：viem。
- 数值计算：decimal.js。
- 链上索引：ponder。
- 合约：Solidity、Foundry、Anvil。
- API 文档：OpenAPI + swagger-ui-dist。
- 环境变量：dotenv。
- 远程数据库或节点隧道：ssh2。
- 本地 TypeScript 脚本：tsx。

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

建议结构：

```text
worldcup-prediction-market/
  apps/
    web/
      app/
      components/
      components/ui/
      hooks/
      lib/
      public/
      styles/
      package.json
      next.config.ts
      tailwind.config.ts
      components.json
    api/
      src/
        app.ts
        env.ts
        routes/
        services/
        db/
        chain/
        openapi/
      package.json
      tsconfig.json
    indexer/
      ponder.config.ts
      src/
        WorldCupMarketFactory.ts
        WorldCupMarket.ts
        OptimisticResultOracle.ts
      package.json
  contracts/
    foundry.toml
    src/
      MockUSDC.sol
      ConditionalTokensLite.sol
      WorldCupMarketFactory.sol
      WorldCupMarket.sol
      OptimisticResultOracle.sol
      interfaces/
    script/
      Deploy.s.sol
      SeedDemo.s.sol
    test/
      WorldCupLiveMarket.t.sol
  packages/
    config/
      src/
        chains.ts
        contracts.ts
        markets.ts
      package.json
    db/
      migrations/
      src/
        schema.ts
        client.ts
      package.json
    odds-ingestion/
      src/
        providers/
        normalizers/
        compare.ts
        sync.ts
      package.json
    sdk/
      src/
        api.ts
        chain.ts
        markets.ts
        types.ts
      package.json
    shared/
      src/
        types.ts
        constants.ts
        validation.ts
      package.json
  docs/
    worldcup-2026-evm-prediction-market.md
    development.md
  package.json
  bunfig.toml
  tsconfig.base.json
  .env.example
```

## 3. 包职责划分

### 3.1 `apps/web`

Next.js 前端应用。

职责：

- 展示正在进行的世界杯比赛。
- 展示当前 live window 市场。
- 支持钱包连接。
- 支持 Mock USDC 余额、授权、买入、卖出、赎回。
- 展示市场状态：Live trading、Closed waiting result、Challenged、Redeemable、Settled。
- 展示结算证据、窗口起止时间、进球事件和 challenge deadline。

UI 约定：

- 使用 shadcn/ui 作为组件基础。
- `components/ui/` 只放 shadcn 生成组件。
- 业务组件放 `components/markets/`、`components/live/`、`components/wallet/`。
- 页面优先 server components，钱包和交易组件使用 client components。
- UI 素材和页面灵感可参考 Uiverse 与 DesignPrompts，但最终代码必须统一改写为项目内的 shadcn/ui + Tailwind 风格。

关键页面：

- `/`：首页，展示 live matches、active windows、可赎回提醒。
- `/live`：Live Markets 列表。
- `/markets/[marketId]`：市场详情。
- `/portfolio`：用户持仓。
- `/settlement`：结算中心。

### 3.2 `apps/api`

Bun + Hono 后端 API。

职责：

- 提供前端查询 API。
- 同步世界杯赛程、live fixture、实时事件。
- 创建 live window metadata。
- 调用合约创建市场。
- 提交窗口结果到 optimistic oracle。
- 暴露 OpenAPI/Swagger 文档。

推荐模块：

```text
apps/api/src/
  app.ts
  env.ts
  routes/
    health.ts
    fixtures.ts
    live-windows.ts
    markets.ts
    portfolio.ts
    settlements.ts
    admin.ts
  services/
    live-window-service.ts
    market-service.ts
    settlement-service.ts
    sports-data-service.ts
  db/
    client.ts
    queries.ts
  chain/
    clients.ts
    contracts.ts
    transactions.ts
  openapi/
    spec.ts
    swagger.ts
```

Hono 路由约定：

- `GET /health`
- `GET /fixtures`
- `GET /live-windows`
- `GET /markets`
- `GET /markets/:marketId`
- `GET /settlements`
- `POST /admin/sync/fixtures`
- `POST /admin/sync/live-events`
- `POST /admin/live-windows/create`
- `POST /admin/markets/create`
- `POST /admin/results/propose`
- `POST /admin/results/finalize`
- `GET /docs`

### 3.3 `apps/indexer`

Ponder 链上索引器。

职责：

- 监听 Foundry/Anvil 或测试网合约事件。
- 将 market、trade、position、result、redeem 事件写入 Postgres。
- 维护链上状态和链下数据库的一致性。

需要索引的事件：

- `MarketCreated`
- `ConditionPrepared`
- `TradeExecuted`
- `PositionSplit`
- `PositionMerged`
- `ResultProposed`
- `ResultChallenged`
- `ResultFinalized`
- `MarketVoided`
- `Redeemed`

### 3.4 `contracts`

Foundry 合约包。

职责：

- 编写和测试 Solidity 合约。
- 使用 Anvil 做本地链。
- 部署 MockUSDC、ConditionalTokensLite、WorldCupMarketFactory、WorldCupMarket、OptimisticResultOracle。

合约模块：

- `MockUSDC.sol`：测试网抵押资产。
- `ConditionalTokensLite.sol`：简化 CTF outcome token。
- `WorldCupMarketFactory.sol`：创建 live window 市场。
- `WorldCupMarket.sol`：Yes/No 二元 AMM、交易、赎回。
- `OptimisticResultOracle.sol`：窗口结果提交、挑战、finalize。

### 3.5 `packages/db`

数据库共享包。

职责：

- 保存 schema、migration、数据库 client。
- 被 `apps/api` 和 `apps/indexer` 共用。

核心表：

- `teams`
- `fixtures`
- `match_events`
- `live_windows`
- `markets`
- `market_outcomes`
- `result_proposals`
- `challenges`
- `user_positions`
- `indexed_blocks`

### 3.6 `packages/sdk`

前后端共享 SDK。

职责：

- 封装 API client。
- 封装 viem 合约读写。
- 输出共享类型。
- 避免前端直接重复拼接口路径和 ABI 逻辑。

### 3.7 `packages/shared`

共享类型和常量。

职责：

- 市场状态枚举。
- fixture 状态枚举。
- live window 类型。
- outcome 类型。
- 通用 validation helper。

### 3.8 `packages/config`

共享配置。

职责：

- chain 配置。
- contract address 配置。
- ABI 导出路径。
- 默认 market 参数，例如 window length、close buffer、challenge window。

## 4. 环境分层

项目必须区分四套环境：

| 环境 | 目的 | 资产 | 数据源 | Oracle |
| --- | --- | --- | --- | --- |
| local | 开发和 Anvil 全流程测试 | MockUSDC | demo snapshot | local oracle |
| testnet | 公共测试和前端 beta | test token | sandbox provider | test oracle |
| staging | 生产前演练 | 受控资产 | production-like provider | UMA/adapter rehearsal |
| production | 商业运行 | 合规抵押资产 | multi-provider + FIFA official | UMA/CTF + fallback |

每个环境必须有独立：

- RPC URL。
- 合约地址。
- 数据库。
- API key。
- provider 配置。
- feature flags。
- 监控 dashboard。
- 管理员权限。

## 5. 本地开发服务

本地开发需要同时运行：

- Postgres。
- Anvil。
- 合约部署脚本。
- API 服务。
- Ponder indexer。
- Next.js 前端。

推荐端口：

- Web：`http://localhost:3000`
- API：`http://localhost:8787`
- Swagger：`http://localhost:8787/docs`
- Anvil RPC：`http://localhost:8545`
- Postgres：`localhost:5432`
- Ponder：按 Ponder 默认配置或项目配置。

## 6. Root Scripts 约定

根目录 `package.json` 建议脚本：

```json
{
  "scripts": {
    "dev": "bun run dev:all",
    "dev:web": "bun --cwd apps/web dev",
    "dev:api": "bun --cwd apps/api dev",
    "dev:indexer": "bun --cwd apps/indexer dev",
    "dev:anvil": "anvil --chain-id 31337 --host 0.0.0.0",
    "deploy:local": "forge script contracts/script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast",
    "test": "bun run test:contracts && bun run test:ts",
    "test:contracts": "forge test -vvv --root contracts",
    "test:ts": "bun test",
    "lint": "bun run lint:web && bun run lint:api",
    "lint:web": "bun --cwd apps/web lint",
    "lint:api": "bun --cwd apps/api lint",
    "typecheck": "bun run typecheck:web && bun run typecheck:api",
    "typecheck:web": "bun --cwd apps/web typecheck",
    "typecheck:api": "bun --cwd apps/api typecheck",
    "db:migrate": "bun --cwd packages/db migrate",
    "db:seed": "bun --cwd packages/db seed",
    "openapi": "bun --cwd apps/api openapi"
  }
}
```

如果不使用并发运行工具，`dev:all` 可以先不做，一开始分终端启动各服务更清晰。

## 7. 环境变量

根目录提供 `.env.example`。

```bash
# App
NODE_ENV=development

# Web
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://localhost:8545
NEXT_PUBLIC_MOCK_USDC_ADDRESS=
NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=
NEXT_PUBLIC_ORACLE_ADDRESS=
NEXT_PUBLIC_CTF_ADDRESS=

# API
API_HOST=0.0.0.0
API_PORT=8787
DATABASE_URL=postgres://postgres:postgres@localhost:5432/worldcup_prediction_market

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

# Odds data
ODDS_DATA_PROVIDERS=demo
ODDS_PRIMARY_PROVIDER=demo
ODDS_API_BASE_URL=
ODDS_API_KEY=
ODDS_SECONDARY_API_BASE_URL=
ODDS_SECONDARY_API_KEY=
ODDS_SYNC_INTERVAL_SECONDS=10
ODDS_STALE_AFTER_SECONDS=30
ODDS_MAX_DEVIATION_BPS=800

# Live window
LIVE_WINDOW_SECONDS=600
LIVE_WINDOW_CLOSE_BUFFER_SECONDS=30
LIVE_EVENT_CONFIRMATION_DELAY_SECONDS=120
CHALLENGE_WINDOW_SECONDS=600

# SSH tunnel, optional
SSH_TUNNEL_ENABLED=false
SSH_TUNNEL_HOST=
SSH_TUNNEL_PORT=22
SSH_TUNNEL_USERNAME=
SSH_TUNNEL_PRIVATE_KEY_PATH=
SSH_TUNNEL_REMOTE_HOST=
SSH_TUNNEL_REMOTE_PORT=
SSH_TUNNEL_LOCAL_PORT=
```

## 8. 后端模块细节

### 7.1 Bun + Hono App

`apps/api/src/app.ts` 负责创建 Hono app：

- 注册 CORS。
- 注册错误处理中间件。
- 注册 request id。
- 注册 routes。
- 挂载 Swagger UI。

错误返回统一格式：

```json
{
  "error": {
    "code": "MARKET_NOT_FOUND",
    "message": "Market not found",
    "details": {}
  }
}
```

### 7.2 decimal.js 使用边界

`decimal.js` 用于：

- AMM quote 预估。
- 前端/API 展示 probability。
- 避免 JavaScript 浮点数导致金额显示错误。

链上金额仍使用 bigint：

- viem 写合约传 bigint。
- 数据库存最小单位字符串。
- API response 可同时返回 raw amount 和 formatted amount。

示例字段：

```ts
type AmountView = {
  raw: string;
  decimals: number;
  formatted: string;
};
```

### 7.3 viem 使用边界

`viem` 用于：

- 创建 public client。
- 创建 wallet client。
- 读取合约状态。
- 写入 market creation、result proposal、finalize。
- 解析交易 receipt。

后端只使用管理员私钥执行受控动作：

- create live window market。
- propose result。
- finalize result。

用户交易在前端由用户钱包签名。

### 7.4 真实盘口数据接入

商业版本必须从专业 provider 拉取真实盘口/赔率数据，覆盖赛前和滚球盘口。

后端职责：

- 接入至少两个 odds provider。
- 标准化 decimal odds、american odds、implied probability、盘口线和 bookmaker。
- 将 raw payload、provider timestamp、ingested timestamp、payload hash 写入数据库。
- 生成 odds comparison。
- 向前端提供外部盘口区间、链上市场概率偏离和 provider freshness。
- 向风控提供 stale/outlier/deviation 信号。

推荐模块：

```text
packages/odds-ingestion/src/
  providers/
    sportradar.ts
    sportsdataio.ts
    the-odds-api.ts
    demo.ts
  normalizers/
    moneyline.ts
    live-goal-window.ts
    next-goal.ts
  compare.ts
  sync.ts
```

接口约定：

- `GET /odds/fixtures/:fixtureId`
- `GET /odds/markets/:marketId`
- `POST /admin/sync/odds`
- `POST /admin/odds/compare`

边界：

- 盘口数据不能作为唯一结算依据。
- 没有授权的 bookmaker feed 不能进入 production。
- provider 延迟或离群时必须展示 warning，并可触发市场暂停。

### 7.5 postgres 使用边界

`postgres` 包用于数据库访问。

约定：

- `packages/db/src/client.ts` 暴露 `sql` client。
- API 和 indexer 不各自创建 schema。
- migration 文件放在 `packages/db/migrations`。
- 所有写入操作必须幂等，尤其是 sync 和 indexer。

### 7.5.1 数据库备份与恢复（生产必备）

商业/预生产 Postgres 必须有多层备份策略，避免因误操作、磁盘故障或勒索软件导致不可逆数据丢失。

**推荐层级：**

1. **托管数据库自动备份**：若使用 RDS、Cloud SQL、Supabase、Neon 等，开启厂商提供的连续归档 / PITR（按时间恢复）与保留周期（通常 ≥ 7 天）。
2. **逻辑备份（`pg_dump`）**：用作跨环境迁移、人工审计与「按副本」恢复；仓库提供脚本读 `DATABASE_URL` 导出 **custom format** 单文件。
3. **对象存储归档**：把 `pg_dump` 产物同步到另一区域的 S3/GCS/R2 等，并开启版本控制或 Immutable 桶策略（满足回放与防篡改需求）。
4. **演练**：每季度至少做一次「从新备份恢复到空实例并跑通 `db:migrate` + 抽检查询」，避免备份链在事故当天才被发现损坏。

**本地 / 自建一键逻辑备份（需本机安装 `pg_dump`，与服务器大版本一致为佳）。实现为 TypeScript：`scripts/pg-backup.ts`（`import.meta.main` 入口）。**

```bash
# 从仓库根目录；会读取 .env 中的 DATABASE_URL
bun run db:backup
```

环境变量（可选，见 `.env.example`）：

- `BACKUP_DIR`：备份文件目录，默认 `<repo>/backups/pg`。
- `BACKUP_RETENTION_DAYS`：正整数时，删除该目录下超过 N 天的 `polygoal-*.dump`（仅影响本机脚本产物，不替代云上保留策略）。

**恢复到空库（custom format，示例）：**

```bash
# 目标库必须已创建且 DATABASE_URL 指向它；--clean 会 drop schema 对象，慎用生产覆盖
pg_restore --clean --if-exists --no-owner --no-acl -d "$DATABASE_URL" ./backups/pg/polygoal-YYYYMMDDTHHMMSSZ.dump
```

**注意：**

- `pg_dump` 为一致性快照；高写入负载下可与低峰时段或副本对齐。
- 含机密的连接串与备份文件禁止提交到 git；`backups/` 已在 `.gitignore` 中排除。

### 7.6 ssh2 使用边界

`ssh2` 只用于可选远程隧道：

- 连接远程 Postgres。
- 连接远程 RPC。
- 连接私有 sports data endpoint。

默认本地开发不启用。

### 7.7 swagger-ui-dist 使用边界

API 提供：

- `GET /openapi.json`
- `GET /docs`

`swagger-ui-dist` 只负责静态 Swagger UI 资源。OpenAPI spec 在 `apps/api/src/openapi/spec.ts` 生成或维护。

## 9. 合约开发

### 8.1 Foundry

`contracts/foundry.toml` 建议：

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
test = "test"
script = "script"
solc_version = "0.8.26"
optimizer = true
optimizer_runs = 200
```

### 8.2 Anvil

本地启动：

```bash
anvil --chain-id 31337 --host 0.0.0.0
```

本地部署：

```bash
forge script contracts/script/Deploy.s.sol \
  --rpc-url http://localhost:8545 \
  --broadcast
```

### 8.3 合约测试重点

必须覆盖：

- 创建 live goal window market。
- 重复 window key 创建失败。
- Yes/No outcome count 固定为 2。
- window trading close 后不能买卖。
- propose result 必须引用有效 market。
- challenge window 结束前不能 finalize。
- Yes 获胜时 Yes shares 可赎回。
- No 获胜时 No shares 可赎回。
- void market 后可退款。

## 10. 数据库开发

### 10.1 商业核心表

商业版本核心表：

- `teams`
- `fixtures`
- `match_events`
- `live_windows`
- `markets`
- `market_outcomes`
- `trades`
- `result_proposals`
- `challenges`
- `redemptions`
- `indexed_blocks`
- `data_source_snapshots`
- `data_comparisons`
- `operator_actions`
- `risk_limits`
- `market_pauses`
- `liquidity_snapshots`
- `odds_snapshots`
- `odds_comparisons`
- `provider_health_checks`
- `audit_logs`
- `feature_flags`

### 10.2 金额字段

所有链上金额字段使用 string 存储：

- `amount_raw`
- `shares_raw`
- `collateral_raw`
- `price_bps`

不在数据库中存 JavaScript number 类型金额。

### 10.3 幂等键

必须有稳定唯一键：

- fixture：`fifa_match_id`
- event：`fixture_id + provider_event_id`
- live window：`fixture_id + window_type + start_match_second + end_match_second`
- market：`market_key`
- result proposal：`market_id + payload_hash`
- indexed event：`chain_id + tx_hash + log_index`

## 11. 前端开发

### 11.1 shadcn/ui

初始化建议：

```bash
cd apps/web
bunx shadcn@latest init
```

常用组件：

```bash
bunx shadcn@latest add button card badge table tabs dialog sheet toast input skeleton separator
```

组件约定：

- `components/ui/*` 不手改业务逻辑。
- 业务组件组合 shadcn/ui。
- 所有链上交易按钮要有 loading、success、error 状态。

### 11.2 UI 素材与 AI 页面设计参考

允许参考以下资源做前端视觉和交互设计：

- [Uiverse Spotlight](https://uiverse.io/spotlight)：用于发现高质量卡片、按钮、加载态、动效和 Web3 风格视觉灵感。
- [Uiverse Elements](https://uiverse.io/elements)：用于参考单个 UI element 的交互效果，例如按钮 hover、toggle、loader、card、input。
- [DesignPrompts](https://www.designprompts.dev/)：用于生成 AI 网页设计 prompt，辅助探索首页、Live Markets、市场详情页和结算中心的版式。

使用边界：

- 不能直接复制无法确认授权的完整代码作为生产代码。
- 不能把 Uiverse 素材直接放进 `components/ui/`。
- 不能引入与 shadcn/ui 冲突的全局 CSS reset。
- 不能为了某个素材引入大型 UI 框架。
- 不能牺牲可访问性、响应式布局和交易状态清晰度。

落地流程：

1. 先用 DesignPrompts 生成 2-3 个页面方向，例如“世界杯实时滚球交易仪表盘”“Polymarket 风格 live match market detail”。
2. 从 Uiverse 选择适合的微交互，例如 live badge、倒计时卡片、交易按钮 loading。
3. 将视觉拆解为 Tailwind class、shadcn/ui 组合和少量本地业务组件。
4. 业务组件放入 `components/live/`、`components/markets/`、`components/settlement/`。
5. 对动效和高风险交互写前端测试，尤其是 disabled、loading、error、success 状态。

推荐使用位置：

- 首页 hero：世界杯 live 状态、倒计时、active window 聚合卡。
- Live Markets 页面：比赛卡片、live badge、窗口倒计时。
- Market Detail 页面：Yes/No outcome 卡、概率条、交易确认面板。
- Settlement 页面：result proposed、challenged、redeemable 状态卡。
- Portfolio 页面：可赎回提醒和收益卡片。

### 11.3 商业级设计系统

前端必须建立可复用设计系统，而不是临时拼页面。

设计系统要求：

- 深色主题优先，同时保留浅色主题能力。
- Tailwind token 统一管理颜色、间距、圆角、阴影和动效。
- 比赛状态、市场状态、结算状态、数据质量状态都有固定 badge 规范。
- 所有交易按钮有统一状态：idle、needs approval、pending signature、pending tx、indexed、failed、disabled。
- 图表和概率条统一使用同一套颜色语义。
- 移动端优先，交易面板必须支持底部 sheet。
- 可访问性满足键盘导航、aria label、颜色对比度。

商业页面规格：

- 首页：赛事氛围、live matches、热门窗口、交易量、可赎回提醒。
- Live Markets：高密度市场列表、筛选、排序、收藏、数据质量状态。
- Market Detail：比分、比赛时钟、窗口、概率、深度、交易、持仓、结算证据。
- Portfolio：持仓、PnL、可赎回、历史交易。
- Settlement Center：提议结果、挑战、证据、finalize 状态。
- Operator Console：数据审核、市场暂停、手动结算、风控操作。

### 11.4 页面数据来源

前端优先从 API 读取聚合数据：

- live matches。
- active windows。
- market detail。
- settlement state。

链上直读用于：

- 用户钱包余额。
- 用户 allowance。
- 用户 shares balance。
- 交易 receipt 确认。

### 11.5 状态显示

Live window 状态映射：

- `scheduled`：灰色。
- `live_trading`：绿色。
- `closing_soon`：黄色。
- `closed`：灰色。
- `proposed`：蓝色。
- `challenged`：红色。
- `redeemable`：紫色。
- `settled`：灰色。

## 12. Ponder 索引器开发

### 12.1 输入

Ponder 读取：

- 合约地址。
- ABI。
- start block。
- RPC URL。

这些配置来自：

- `packages/config`
- `.env`

### 12.2 输出

Ponder 写入 Postgres：

- markets。
- trades。
- user positions。
- result proposals。
- challenges。
- redemptions。

### 12.3 重放策略

本地开发允许清空索引表后重放：

```bash
bun --cwd apps/indexer reset
bun --cwd apps/indexer dev
```

生产或测试网环境不允许随意清空，需要按 block range 做回放。

## 13. 生产级服务能力

商业版本必须从开发阶段就内置生产能力。

### 13.1 CI/CD

CI 必须包含：

- install。
- typecheck。
- lint。
- unit tests。
- integration tests。
- contract tests。
- coverage gates >= 95%。
- Foundry gas snapshot。
- ABI drift check。
- OpenAPI diff check。
- database migration dry-run。
- frontend build。
- Docker image build。

CD 必须支持：

- staging 自动部署。
- production 手动批准。
- 合约部署多签确认。
- 合约地址发布到 config 包。
- 回滚前端/API/indexer。
- migration 备份和回滚策略。

### 13.2 可观测性

必须接入：

- structured logs。
- request id。
- trace id。
- metrics。
- uptime checks。
- provider health checks。
- indexer lag metrics。
- transaction failure metrics。

关键指标：

- API p50/p95/p99 latency。
- API error rate。
- provider event delay。
- market creation failure count。
- result proposal delay。
- indexer block lag。
- wallet transaction failure rate。
- data mismatch count。
- redeem failure rate。

### 13.3 安全工程

要求：

- 管理员私钥不能直接放在普通 `.env` 中用于生产。
- production 管理操作走多签或 signer service。
- 所有 admin routes 需要认证、授权和审计。
- 所有 market pause、void、finalize 操作写 audit log。
- dependency audit 进入 CI。
- 合约部署前必须有静态分析和人工 review。
- 任何真实资产上线前必须完成外部审计。

### 13.4 商业配置中心

需要 feature flags：

- enableRealCollateral。
- enableLiveGoalWindow。
- enableNextGoalMarket。
- enableCardMarket。
- enableCornerMarket。
- enablePublicChallenge。
- enableUmaAdapter。
- enableGeoBlock。
- enableTradingFees。

配置必须支持按环境、按市场、按国家/地区生效。

## 14. 开发顺序

建议顺序：

1. 初始化 monorepo workspace。
2. 初始化 `contracts` Foundry 项目。
3. 编写 MockUSDC、ConditionalTokensLite、WorldCupMarketFactory、WorldCupMarket、OptimisticResultOracle。
4. 编写 Foundry 测试。
5. 初始化 `packages/db`，创建商业核心 schema 和 seed。
6. 初始化 `apps/api`，实现 Hono health、fixtures、live-windows、markets。
7. 初始化 `apps/indexer`，监听合约事件写库。
8. 初始化 `apps/web`，接 shadcn/ui。
9. 前端接 API 展示 live markets。
10. 前端接钱包和 viem 交易。
11. 做完整端到端 demo：seed live fixture -> create window -> buy Yes/No -> submit goal -> finalize -> redeem。

## 15. 本地端到端流程

1. 启动 Postgres。
2. 执行 DB migration。
3. 启动 Anvil。
4. 部署合约。
5. 将合约地址写入 `.env`。
6. 启动 API。
7. 启动 indexer。
8. 启动 web。
9. seed demo fixture：Brazil vs Morocco，比赛时间 63:00。
10. 创建 63:00-73:00 live window。
11. 用户买 Yes，另一个用户买 No。
12. seed goal event。
13. API propose result。
14. challenge window 结束后 finalize。
15. 用户 redeem。

## 16. 商业验收标准

开发版完成时必须满足：

- Monorepo 能安装依赖。
- Web、API、Indexer、Anvil 能分别启动。
- Foundry 合约测试通过。
- API health check 通过。
- Swagger 页面可打开。
- 数据库能 seed demo fixture 和 live window。
- 可以创建一个 Yes/No live goal window market。
- 用户可以用 Mock USDC 买入 outcome shares。
- 窗口关闭后不能交易。
- 可以提交 Yes 或 No 结果。
- 可以 finalize。
- 获胜 outcome 可以 redeem。
- 前端可以展示完整状态流。
- 商业级设计系统骨架完成。
- 数据源对比、市场暂停、审计日志、运营后台基础能力完成。
- CI 覆盖 typecheck、lint、tests、coverage、build。
- 合约、后端、前端覆盖率均 >= 95%。
- staging 部署流程有文档和脚本。

## 17. 约束

- 第一条端到端路径从简易实时滚球开始，但架构必须支持商业市场矩阵扩展。
- local 使用 MockUSDC，testnet/staging/production 必须通过配置切换抵押资产策略。
- 不接真实博彩赔率作为自动结算依据；商业版本可显示第三方 odds 作为参考但必须标注来源。
- 生产合规能力可以按地域关闭交易，但代码必须预留 feature flag 和访问控制。
- 不把 JavaScript number 用作链上金额。
- 不让前端直接信任未确认的 live event 作为最终结果。
