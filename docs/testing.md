# 2026 世界杯实时滚球预测市场测试文档

## 1. 测试目标

本文档定义本项目从本地 Anvil 到商业发布的完整测试流程。Anvil 是基础闭环测试环境，但商业可运行版本还必须覆盖 staging、生产级数据源、运营后台、风控、性能、安全、覆盖率和 review-fix release gate。

- Foundry/Anvil 本地链环境。
- 合约部署、合约功能和合约事件。
- MockUSDC、ConditionalTokensLite、WorldCupMarketFactory、WorldCupMarket、OptimisticResultOracle。
- Bun + Hono 后端接口。
- Ponder 链上事件索引。
- Postgres 数据一致性。
- Next.js + shadcn/ui 前端展示和用户交互。
- 端到端流程：创建实时滚球窗口 -> 用户交易 -> 事件结算 -> finalize -> redeem。

第一条端到端路径从一个简易实时滚球市场开始：

> Brazil vs Morocco，63:00-73:00，未来 10 分钟是否进球？

Outcome：

- Yes
- No

商业完整测试还必须覆盖市场矩阵、数据冗余、风控阻断、运营后台、性能和安全发布门槛。

## 2. 测试范围

### 2.1 必测范围

- 本地 Anvil 链启动。
- 合约编译、单元测试、部署。
- MockUSDC mint、approve、transfer。
- 创建 live goal window market。
- 重复创建同一 window market 失败。
- 用户买 Yes/No outcome shares。
- 窗口关闭后禁止继续交易。
- 提交窗口结果。
- challenge window 生效。
- finalize 结果。
- 获胜 outcome redeem。
- 失败 outcome 不可获得 payout。
- 合约事件被 Ponder 索引。
- 后端 API 返回正确市场和结算状态。
- 前端展示 live window、交易状态、结算状态和 redeem 状态。
- 用户通过钱包完成 approve、buy、redeem。
- 合约、后端、前端测试覆盖率都必须达到 95% 或以上。

### 2.2 不测范围

- 未获得合规批准的真实资金公开交易。
- 未签约 provider 的生产 API SLA。
- 未审计合约的生产资金托管。
- 未批准地区的真实交易开放。

商业版本不允许把这些“不测范围”理解为“不需要设计”。相关能力必须通过 feature flag、staging rehearsal 或运营流程保留。

### 2.3 覆盖率硬性门槛

本项目要求三类代码的测试覆盖率都不低于 95%：

- 合约覆盖率：line、statement、branch、function 均不低于 95%。
- 后端覆盖率：line、statement、branch、function 均不低于 95%。
- 前端覆盖率：line、statement、branch、function 均不低于 95%。

覆盖率低于 95% 时：

- 不允许标记测试通过。
- 不允许进入 Anvil 全流程验收完成状态。
- 不允许创建 PR 或合并。
- 必须补测试，不能通过删除未覆盖代码、降低阈值、排除核心文件来规避。

允许排除覆盖率统计的内容仅限：

- 自动生成文件。
- ABI JSON。
- shadcn/ui 原始生成组件。
- 类型声明文件。
- 构建产物。
- demo seed 静态数据。

不能排除：

- 合约核心逻辑。
- Hono route handler。
- service 层。
- 数据对比逻辑。
- result proposal/finalize 逻辑。
- 前端交易组件。
- 前端状态展示组件。
- SDK 合约读写封装。

## 3. 本地测试环境

### 3.1 必要工具

需要安装：

- Bun。
- Node.js。
- Foundry：`forge`、`anvil`、`cast`。
- Postgres。
- 浏览器钱包，例如 MetaMask 或 Rabby。

检查命令：

```bash
bun --version
node --version
forge --version
anvil --version
cast --version
psql --version
```

### 3.2 本地端口

- Anvil RPC：`http://localhost:8545`
- API：`http://localhost:8787`
- Swagger：`http://localhost:8787/docs`
- Web：`http://localhost:3000`
- Postgres：`localhost:5432`

### 3.3 环境变量

测试使用 `.env.local` 或 `.env.test`。

```bash
NODE_ENV=test

DATABASE_URL=postgres://postgres:postgres@localhost:5432/worldcup_prediction_market_test

CHAIN_ID=31337
RPC_URL=http://localhost:8545
PRIVATE_KEY=<anvil-account-private-key>

MOCK_USDC_ADDRESS=
CTF_ADDRESS=
MARKET_FACTORY_ADDRESS=
ORACLE_ADDRESS=

NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://localhost:8545
NEXT_PUBLIC_MOCK_USDC_ADDRESS=
NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=
NEXT_PUBLIC_ORACLE_ADDRESS=
NEXT_PUBLIC_CTF_ADDRESS=

SPORTS_DATA_PROVIDER=demo
LIVE_WINDOW_SECONDS=600
LIVE_WINDOW_CLOSE_BUFFER_SECONDS=30
LIVE_EVENT_CONFIRMATION_DELAY_SECONDS=120
CHALLENGE_WINDOW_SECONDS=600
```

## 4. 测试数据

### 4.0 数据准确性原则

世界杯球队、赛程、场馆、开球时间和 live 事件数据必须先通过多源对比，才能进入市场创建或结算流程。

硬性规则：

- FIFA 官方赛程、官方球队/分组信息和官方公告是最高优先级校验源。
- 第三方体育数据 API 只能作为程序化同步源，不能单独作为最终可信源。
- 至少保存两个来源的数据快照：official snapshot 和 provider snapshot。
- canonical 数据必须由 comparison job 生成，不能直接把 provider payload 当成 canonical。
- 关键字段不一致时，相关 fixture、live window 和 market 必须进入 `data_review_required`，禁止开池。
- live 事件用于结算前必须通过窗口内事件对比；无法确认时禁止自动提交结果。
- 所有数据源 payload 必须保存 raw JSON、source、source timestamp、ingested at 和 payload hash。

### 4.1 Demo fixture

测试 fixture：

```json
{
  "fifaMatchId": "demo-2026-001",
  "matchNumber": 1,
  "homeTeam": "Brazil",
  "awayTeam": "Morocco",
  "status": "live",
  "homeScore": 0,
  "awayScore": 0,
  "matchSecond": 3780,
  "displayClock": "63:00",
  "venue": "New York New Jersey Stadium"
}
```

### 4.2 Demo live window

```json
{
  "windowType": "goal_in_next_10_minutes",
  "windowStartMatchSecond": 3780,
  "windowEndMatchSecond": 4380,
  "tradingCloseMatchSecond": 4350,
  "title": "Brazil vs Morocco, 63:00-73:00 - will either team score a goal?",
  "outcomes": ["Yes", "No"]
}
```

### 4.3 Demo goal event

用于 Yes 结算路径：

```json
{
  "providerEventId": "demo-goal-001",
  "eventType": "goal",
  "team": "Brazil",
  "matchMinute": 67,
  "matchSecond": 4020,
  "isConfirmed": true,
  "isCancelled": false
}
```

用于 No 结算路径：

```json
{
  "events": []
}
```

用于 VAR 取消路径：

```json
{
  "providerEventId": "demo-goal-002",
  "eventType": "goal_cancelled",
  "team": "Brazil",
  "matchMinute": 67,
  "matchSecond": 4020,
  "isConfirmed": true,
  "isCancelled": true
}
```

### 4.4 数据对比测试样本

球队对比样本：

```json
{
  "source": "fifa_official",
  "team": {
    "name": "Brazil",
    "fifaCode": "BRA",
    "confederation": "CONMEBOL",
    "qualifiedStatus": "qualified"
  }
}
```

```json
{
  "source": "sports_data_provider",
  "team": {
    "name": "Brazil",
    "fifaCode": "BRA",
    "confederation": "CONMEBOL",
    "qualifiedStatus": "qualified"
  }
}
```

赛程对比样本：

```json
{
  "source": "fifa_official",
  "fixture": {
    "fifaMatchId": "demo-2026-001",
    "matchNumber": 1,
    "homeTeam": "Brazil",
    "awayTeam": "Morocco",
    "kickoffAtUtc": "2026-06-13T21:00:00.000Z",
    "venue": "New York New Jersey Stadium",
    "stage": "group"
  }
}
```

```json
{
  "source": "sports_data_provider",
  "fixture": {
    "fifaMatchId": "demo-2026-001",
    "matchNumber": 1,
    "homeTeam": "Brazil",
    "awayTeam": "Morocco",
    "kickoffAtUtc": "2026-06-13T21:00:00.000Z",
    "venue": "New York New Jersey Stadium",
    "stage": "group"
  }
}
```

不一致样本：

```json
{
  "field": "kickoffAtUtc",
  "officialValue": "2026-06-13T21:00:00.000Z",
  "providerValue": "2026-06-13T22:00:00.000Z",
  "severity": "critical",
  "action": "block_market_creation"
}
```

## 5. 启动顺序

### 5.1 启动 Postgres

如果使用本地 Postgres：

```bash
createdb worldcup_prediction_market_test
```

如果使用 Docker：

```bash
docker run --name worldcup-prediction-market-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=worldcup_prediction_market_test \
  -p 5432:5432 \
  -d postgres:16
```

验收：

```bash
psql "$DATABASE_URL" -c "select 1;"
```

期望：

```text
 ?column?
----------
        1
```

### 5.2 启动 Anvil

```bash
anvil --chain-id 31337 --host 0.0.0.0 --port 8545
```

记录 Anvil 输出的第一个私钥作为测试部署私钥。

验收：

```bash
cast chain-id --rpc-url http://localhost:8545
```

期望：

```text
31337
```

### 5.3 编译和测试合约

```bash
forge build --root contracts
forge test --root contracts -vvv
forge coverage --root contracts
```

期望：

- 编译成功。
- 所有 Foundry 测试通过。
- 没有 unexpected revert。
- 合约覆盖率 line、statement、branch、function 都不低于 95%。
- coverage report 中 `src/` 下核心合约不能低于 95%。

如果 `forge coverage` 对复杂合约产生 stack too deep，可使用 via-ir coverage 配置，但不能降低覆盖率要求：

```bash
FOUNDRY_PROFILE=coverage forge coverage --root contracts --ir-minimum
```

### 5.4 部署合约

```bash
forge script contracts/script/Deploy.s.sol \
  --rpc-url http://localhost:8545 \
  --broadcast \
  --private-key "$PRIVATE_KEY"
```

部署后记录地址：

- `MOCK_USDC_ADDRESS`
- `CTF_ADDRESS`
- `MARKET_FACTORY_ADDRESS`
- `ORACLE_ADDRESS`

写入 `.env.test` 和前端公开环境变量。

验收：

```bash
cast code "$MOCK_USDC_ADDRESS" --rpc-url http://localhost:8545
cast code "$MARKET_FACTORY_ADDRESS" --rpc-url http://localhost:8545
cast code "$ORACLE_ADDRESS" --rpc-url http://localhost:8545
```

期望：

- 返回非 `0x` bytecode。

### 5.5 数据库迁移和 seed

```bash
bun --cwd packages/db migrate
bun --cwd packages/db seed:test
```

验收：

```bash
psql "$DATABASE_URL" -c "select count(*) from fixtures;"
psql "$DATABASE_URL" -c "select count(*) from live_windows;"
```

期望：

- fixtures 至少有 1 条 demo fixture。
- live_windows 可以为 0，等待 API 或 admin job 创建。

### 5.6 数据源快照导入和对比

在创建任何 live window market 前，必须先导入 official snapshot 和 provider snapshot，并运行对比任务。

```bash
bun --cwd apps/api scripts/import-official-snapshot.ts --fixture demo-2026-001
bun --cwd apps/api scripts/import-provider-snapshot.ts --fixture demo-2026-001
bun --cwd apps/api scripts/compare-fixture-data.ts --fixture demo-2026-001
```

验收：

```bash
psql "$DATABASE_URL" -c "select source, payload_hash from data_source_snapshots;"
psql "$DATABASE_URL" -c "select status, critical_mismatch_count from data_comparisons where subject_key = 'fixture:demo-2026-001';"
```

期望：

- `data_source_snapshots` 至少有 `fifa_official` 和 `sports_data_provider` 两类来源。
- `data_comparisons.status = verified`。
- `critical_mismatch_count = 0`。
- 如果存在 critical mismatch，后续 `POST /admin/live-windows/create` 必须失败。

### 5.7 启动 API

```bash
bun --cwd apps/api dev
```

验收：

```bash
curl http://localhost:8787/health
```

期望：

```json
{
  "ok": true
}
```

### 5.8 启动 Ponder indexer

```bash
bun --cwd apps/indexer dev
```

验收：

- indexer 启动无错误。
- 能连接 Anvil RPC。
- 能连接 Postgres。
- 能识别合约地址。

### 5.9 启动前端

```bash
bun --cwd apps/web dev
```

打开：

```text
http://localhost:3000
```

验收：

- 首页可打开。
- 无前端运行时报错。
- 钱包连接按钮可见。

## 6. 合约功能测试

### 6.1 MockUSDC

测试点：

- deploy 后 decimals 为 6。
- faucet/mint 可给测试账户发币。
- approve market 成功。
- transferFrom 成功。

命令示例：

```bash
cast call "$MOCK_USDC_ADDRESS" "decimals()(uint8)" --rpc-url "$RPC_URL"
cast send "$MOCK_USDC_ADDRESS" "mint(address,uint256)" "$USER_A" 1000000000 \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY"
cast call "$MOCK_USDC_ADDRESS" "balanceOf(address)(uint256)" "$USER_A" --rpc-url "$RPC_URL"
```

期望：

- decimals 返回 `6`。
- `USER_A` 获得 1000 Mock USDC。

### 6.2 创建 live window market

通过 factory 创建市场。

输入：

- fixture id：`demo-2026-001`
- market key：`fixture:demo-2026-001:goal_window:3780:4380`
- outcome count：2
- close time：窗口结束前 30 秒对应的 block timestamp。
- resolution policy hash：窗口是否进球规则 hash。

测试点：

- 创建成功。
- market address 非零。
- condition prepared。
- outcome token id 可查询。
- 同一 market key 再次创建必须 revert。

期望事件：

- `ConditionPrepared`
- `MarketCreated`

### 6.3 买入 Yes

流程：

1. 给 `USER_A` mint MockUSDC。
2. `USER_A` approve market。
3. `USER_A` buy Yes。

测试点：

- USDC 从 user 转入 market/pool。
- Yes shares 增加。
- No shares 不增加。
- market volume 增加。
- price/probability 更新。

期望事件：

- `Approval`
- `Transfer`
- `PositionSplit`
- `TradeExecuted`

### 6.4 买入 No

流程：

1. 给 `USER_B` mint MockUSDC。
2. `USER_B` approve market。
3. `USER_B` buy No。

测试点：

- No shares 增加。
- pool reserve 更新。
- Yes/No implied probability 改变。

期望事件：

- `TradeExecuted(outcomeIndex = 1)`

### 6.5 窗口关闭后禁止交易

流程：

1. 使用 Anvil 增加时间到 `tradingCloseTime` 之后。
2. 尝试 buy Yes。

命令示例：

```bash
cast rpc anvil_increaseTime 600 --rpc-url "$RPC_URL"
cast rpc anvil_mine 1 --rpc-url "$RPC_URL"
```

期望：

- buy revert。
- revert reason 类似 `MarketClosed` 或 `TradingClosed`。
- 不产生 `TradeExecuted`。

### 6.6 提交 Yes 结果

条件：

- demo goal event 在窗口内。
- `goal_count_in_window > 0`。

流程：

1. result worker 或 admin 提交 `winningOutcome = 0`。
2. oracle 记录 proposed result。
3. market 状态进入 `ResultProposed`。

期望事件：

- `ResultProposed`

检查字段：

- `marketId`
- `winningOutcome = 0`
- `homeScore`
- `awayScore`
- `goalCountInWindow = 1`
- `evidenceUri`
- `challengeDeadline`

### 6.7 提交 No 结果

条件：

- 窗口内无 confirmed goal。
- 或 goal 被 VAR 取消。

流程：

1. 提交 `winningOutcome = 1`。
2. oracle 记录 proposed result。

期望：

- `ResultProposed(winningOutcome = 1)`。

### 6.8 Challenge

流程：

1. 在 challenge window 内调用 challenge。
2. 提供 reason 和 evidence URI。

期望事件：

- `ResultChallenged`

期望状态：

- proposal status 为 `challenged`。
- market 暂不可 finalize。
- 前端显示 challenged。

### 6.9 Finalize

无人 challenge 路径：

1. Anvil 增加时间到 challenge deadline 后。
2. 调用 finalize。

期望事件：

- `ResultFinalized`

期望状态：

- market finalized。
- payout vector 写入 CTF。
- winner outcome redeemable。

### 6.10 Redeem

Yes 获胜路径：

- `USER_A` 持有 Yes shares。
- `USER_B` 持有 No shares。

期望：

- `USER_A` redeem 后 MockUSDC 增加。
- `USER_A` Yes shares 减少或 burn。
- `USER_B` redeem 不获得 payout，或 redeem amount 为 0。

期望事件：

- `Redeemed`
- ERC20 `Transfer`

## 7. 合约事件测试清单

### 7.1 必须发出的事件

| 操作 | 事件 |
| --- | --- |
| 创建 condition | `ConditionPrepared` |
| 创建 market | `MarketCreated` |
| 买入 outcome | `TradeExecuted` |
| 拆分 collateral | `PositionSplit` |
| 合并 outcome | `PositionMerged` |
| 提交结果 | `ResultProposed` |
| 挑战结果 | `ResultChallenged` |
| finalize | `ResultFinalized` |
| void | `MarketVoided` |
| redeem | `Redeemed` |

### 7.2 事件字段要求

`MarketCreated` 必须包含：

- `marketId`
- `marketKey`
- `fixtureId`
- `windowStartMatchSecond`
- `windowEndMatchSecond`
- `market`
- `conditionId`
- `outcomeCount`

`TradeExecuted` 必须包含：

- `marketId`
- `trader`
- `outcomeIndex`
- `collateralAmount`
- `sharesAmount`
- `tradeType`

`ResultProposed` 必须包含：

- `marketId`
- `proposalId`
- `proposer`
- `winningOutcome`
- `payloadHash`
- `challengeDeadline`

`ResultFinalized` 必须包含：

- `marketId`
- `winningOutcome`
- `payoutNumerators`
- `payoutDenominator`

`Redeemed` 必须包含：

- `marketId`
- `user`
- `outcomeIndex`
- `sharesBurned`
- `collateralPaid`

## 8. 后端接口测试

### 8.0 后端覆盖率要求

后端测试覆盖率必须达到 95% 或以上。

建议命令：

```bash
bun --cwd apps/api test --coverage
```

覆盖率必须覆盖：

- Hono route handler。
- request validation。
- error handler。
- sports data adapter。
- data quality comparison service。
- live window service。
- market service。
- settlement service。
- viem transaction wrapper。
- Postgres query helper。
- OpenAPI spec generation 的关键路径。

最低门槛：

- lines >= 95%。
- statements >= 95%。
- branches >= 95%。
- functions >= 95%。

失败条件：

- 任一指标低于 95%。
- route handler 只测 happy path，没有测错误路径。
- data quality mismatch 阻断逻辑没有测试。
- result proposal 在未 verified 数据下被允许。

### 8.1 Health

```bash
curl -s http://localhost:8787/health
```

期望：

```json
{
  "ok": true
}
```

### 8.2 数据源对比状态

```bash
curl -s "http://localhost:8787/data-quality/fixtures/demo-2026-001"
```

期望：

```json
{
  "fixtureId": "demo-2026-001",
  "status": "verified",
  "sources": ["fifa_official", "sports_data_provider"],
  "criticalMismatchCount": 0,
  "warnings": []
}
```

失败场景：

```json
{
  "fixtureId": "demo-2026-001",
  "status": "data_review_required",
  "criticalMismatchCount": 1,
  "mismatches": [
    {
      "field": "kickoffAtUtc",
      "officialValue": "2026-06-13T21:00:00.000Z",
      "providerValue": "2026-06-13T22:00:00.000Z",
      "action": "block_market_creation"
    }
  ]
}
```

### 8.3 触发 fixtures 对比

```bash
curl -s -X POST http://localhost:8787/admin/data-quality/fixtures/compare \
  -H "content-type: application/json" \
  -d '{"fixtureId":"demo-2026-001"}'
```

期望：

- 返回 comparison id。
- `status = verified`。
- `criticalMismatchCount = 0`。

### 8.4 获取 fixtures

```bash
curl -s "http://localhost:8787/fixtures?status=live"
```

期望：

- 返回 Brazil vs Morocco。
- status 为 `live`。
- match clock 为 `63:00` 或接近 demo 设置。
- `dataQualityStatus = verified`。

### 8.5 同步 live events

```bash
curl -s -X POST http://localhost:8787/admin/sync/live-events \
  -H "content-type: application/json" \
  -d '{"fixtureId":"demo-2026-001","mode":"demo_goal"}'
```

期望：

- 返回 inserted/updated event count。
- 数据库 `match_events` 有 goal 事件。
- 返回 live event comparison status。

### 8.6 对比 live events

```bash
curl -s -X POST http://localhost:8787/admin/data-quality/live-events/compare \
  -H "content-type: application/json" \
  -d '{
    "fixtureId": "demo-2026-001",
    "windowStartMatchSecond": 3780,
    "windowEndMatchSecond": 4380
  }'
```

期望：

- confirmed goal event 数量与 provider/official event snapshot 一致。
- 被 VAR 取消的进球不计入 confirmed goal。
- `status = verified`。
- 如果 live event 未验证，`POST /admin/results/propose` 必须失败。

### 8.7 创建 live window

```bash
curl -s -X POST http://localhost:8787/admin/live-windows/create \
  -H "content-type: application/json" \
  -d '{
    "fixtureId": "demo-2026-001",
    "windowType": "goal_in_next_10_minutes",
    "startMatchSecond": 3780,
    "endMatchSecond": 4380
  }'
```

期望：

- 返回 live window id。
- `status = scheduled` 或 `live_trading`。
- window key 为 `fixture:demo-2026-001:goal_window:3780:4380`。
- fixture data quality 必须为 `verified`。

### 8.8 创建链上 market

```bash
curl -s -X POST http://localhost:8787/admin/markets/create \
  -H "content-type: application/json" \
  -d '{
    "liveWindowId": "<live-window-id>"
  }'
```

期望：

- 返回 market id。
- 返回 market address。
- 返回 tx hash。
- 数据库 markets 表写入 chain address。
- Ponder 最终索引到 `MarketCreated`。
- 如果 fixture/team/schedule 对比未通过，接口必须返回 409。

### 8.9 获取 live windows

```bash
curl -s "http://localhost:8787/live-windows?status=live_trading"
```

期望：

- 返回刚创建的窗口。
- outcomes 为 Yes/No。
- 有 price、volume、liquidity。
- 有 `windowStartMatchSecond` 和 `windowEndMatchSecond`。
- 有 `dataQualityStatus = verified`。

### 8.10 获取 market detail

```bash
curl -s "http://localhost:8787/markets/<market-id>"
```

期望：

- 返回 fixture context。
- 返回 current score。
- 返回 match clock。
- 返回 Yes/No outcomes。
- 返回 resolution policy。
- 返回 oracle state。
- 返回 source comparison summary。

### 8.11 提交窗口结果

```bash
curl -s -X POST http://localhost:8787/admin/results/propose \
  -H "content-type: application/json" \
  -d '{
    "marketId": "<market-id>",
    "evidenceUri": "demo://fixture/demo-2026-001/events"
  }'
```

Yes 路径期望：

- `winningOutcome = 0`。
- `goalCountInWindow = 1`。
- 返回 proposal tx hash。
- live event comparison status 必须为 `verified`。

No 路径期望：

- `winningOutcome = 1`。
- `goalCountInWindow = 0`。
- live event comparison status 必须为 `verified`。

### 8.12 获取 settlements

```bash
curl -s "http://localhost:8787/settlements?status=proposed"
```

期望：

- 返回 result proposal。
- 有 challenge deadline。
- 有 goal events in window。
- finalization status 为 pending。
- 有 data source comparison summary。

### 8.13 Finalize

先推进 Anvil 时间：

```bash
cast rpc anvil_increaseTime 700 --rpc-url "$RPC_URL"
cast rpc anvil_mine 1 --rpc-url "$RPC_URL"
```

调用 API：

```bash
curl -s -X POST http://localhost:8787/admin/results/finalize \
  -H "content-type: application/json" \
  -d '{
    "marketId": "<market-id>"
  }'
```

期望：

- 返回 finalize tx hash。
- market status 变为 `redeemable` 或 `settled`。

## 9. Ponder 索引测试

### 9.1 MarketCreated 索引

检查：

```sql
select market_key, market_address, condition_id
from markets
where market_key = 'fixture:demo-2026-001:goal_window:3780:4380';
```

期望：

- 有一条记录。
- market_address 非空。
- condition_id 非空。

### 9.2 TradeExecuted 索引

检查：

```sql
select wallet_address, outcome_index, collateral_amount_raw, shares_amount_raw
from trades
where market_id = '<market-id>'
order by created_at asc;
```

期望：

- 至少两条交易：USER_A 买 Yes，USER_B 买 No。
- outcome_index 分别为 0 和 1。

### 9.3 ResultProposed 索引

检查：

```sql
select winning_outcome, goal_count_in_window, status
from result_proposals
where market_id = '<market-id>';
```

期望：

- winning_outcome 与 demo event 一致。
- status 为 proposed 或 finalized。

### 9.4 Redeemed 索引

检查：

```sql
select wallet_address, outcome_index, collateral_paid_raw
from redemptions
where market_id = '<market-id>';
```

期望：

- 获胜用户有 payout。
- 失败用户没有 payout 或 payout 为 0。

## 10. 数据准确性测试

### 10.1 球队数据对比

必须对比字段：

- `team.name`
- `team.fifaCode`
- `team.countryCode`
- `team.confederation`
- `team.qualifiedStatus`
- `team.group`

通过条件：

- FIFA 官方快照和 provider 快照的 FIFA code 一致。
- 球队名称允许存在展示差异，但必须映射到同一个 canonical team id。
- group、qualified status 不一致时为 critical mismatch。

SQL 检查：

```sql
select subject_key, status, critical_mismatch_count
from data_comparisons
where subject_type = 'team';
```

期望：

- 所有商业测试 demo teams 的 `status = verified`。
- `critical_mismatch_count = 0`。

### 10.2 赛程数据对比

必须对比字段：

- `fifaMatchId`
- `matchNumber`
- `homeTeam` 或 home slot。
- `awayTeam` 或 away slot。
- `kickoffAtUtc`
- `venue`
- `city`
- `country`
- `stage`
- `group`

critical mismatch：

- match id 不一致。
- 对阵双方不一致。
- 开球 UTC 时间不一致。
- 场馆不一致。
- 比赛阶段或小组不一致。

warning mismatch：

- 队名大小写差异。
- 场馆展示名轻微差异，但 canonical venue id 一致。
- provider 缺少非结算字段。

通过条件：

- 没有 critical mismatch。
- warning mismatch 有记录但不阻塞。
- canonical fixture 明确标记 `data_quality_status = verified`。

### 10.3 Live 事件对比

必须对比字段：

- `fixtureId`
- `providerEventId`
- `eventType`
- `team`
- `matchSecond`
- `isConfirmed`
- `isCancelled`

结算前规则：

- goal event 必须在窗口 `[windowStartMatchSecond, windowEndMatchSecond)` 内。
- `eventType = goal` 且 `isConfirmed = true` 且 `isCancelled = false` 才计入 Yes。
- `goal_cancelled` 或 VAR 取消事件必须把对应 goal 排除。
- 如果 provider 事件和官方事件数量不一致，结果进入 `data_review_required`。
- `data_review_required` 时禁止自动 propose result。

### 10.4 阻断测试

故意制造赛程不一致：

```bash
curl -s -X POST http://localhost:8787/admin/data-quality/fixtures/inject-mismatch \
  -H "content-type: application/json" \
  -d '{
    "fixtureId": "demo-2026-001",
    "field": "kickoffAtUtc",
    "providerValue": "2026-06-13T22:00:00.000Z"
  }'
```

然后尝试创建 live window：

```bash
curl -i -X POST http://localhost:8787/admin/live-windows/create \
  -H "content-type: application/json" \
  -d '{
    "fixtureId": "demo-2026-001",
    "windowType": "goal_in_next_10_minutes",
    "startMatchSecond": 3780,
    "endMatchSecond": 4380
  }'
```

期望：

```text
HTTP/1.1 409 Conflict
```

错误 body：

```json
{
  "error": {
    "code": "DATA_QUALITY_REVIEW_REQUIRED",
    "message": "Fixture data has critical mismatches and cannot create a market"
  }
}
```

## 11. 前端展示测试

### 11.0 前端覆盖率要求

前端测试覆盖率必须达到 95% 或以上。

建议命令：

```bash
bun --cwd apps/web test --coverage
```

如果前端采用 Vitest，coverage 配置必须设置：

```ts
coverage: {
  thresholds: {
    lines: 95,
    statements: 95,
    branches: 95,
    functions: 95
  }
}
```

覆盖率必须覆盖：

- live match 列表。
- live window 卡片。
- market detail 页面。
- data quality badge 和 mismatch 阻断提示。
- wallet connect 状态。
- approve/buy/redeem 按钮状态。
- 交易 pending/success/error 状态。
- result proposed、challenged、redeemable、settled 状态展示。
- API client error handling。
- viem read/write wrapper。

允许不计入覆盖率：

- shadcn/ui 原始生成组件。
- Next.js layout metadata。
- 静态图标和样式文件。

不能排除：

- 组合 shadcn/ui 的业务组件。
- 交易表单。
- 状态卡片。
- hooks。
- SDK 调用封装。

### 11.1 首页

打开：

```text
http://localhost:3000
```

必须看到：

- 钱包连接按钮。
- 当前 Anvil 网络提示。
- Brazil vs Morocco live match。
- 当前比分。
- active live window 卡片。
- 窗口倒计时。
- 测试网风险提示。

失败条件：

- 页面空白。
- 控制台有未捕获异常。
- live window 不显示。

### 11.2 Live Markets 页面

打开：

```text
http://localhost:3000/live
```

必须看到：

- live match 列表。
- Yes/No probability。
- liquidity。
- volume。
- close time。
- market status。
- data quality badge：verified。

交互：

- 按比赛筛选。
- 按状态筛选。
- 点击 market card 进入详情页。

### 11.3 Market Detail 页面

打开：

```text
http://localhost:3000/markets/<market-id>
```

必须看到：

- 标题：未来 10 分钟是否进球。
- Brazil vs Morocco。
- 当前比分。
- 窗口：63:00-73:00。
- Yes/No 两个 outcome。
- 买入/卖出组件。
- 持仓区。
- 结算规则。
- Oracle 状态。
- 数据源对比状态：verified。
- official source 和 provider source 摘要。

交易前：

- 未连接钱包时，按钮显示连接钱包。
- 连接钱包后，显示 MockUSDC 余额。
- allowance 不足时，先显示 approve。

### 11.4 Approve 交互

步骤：

1. 连接钱包到 Anvil chain 31337。
2. 导入 Anvil 测试账户。
3. 点击 approve。
4. 钱包弹窗确认。

期望：

- approve pending 时按钮 loading。
- approve 成功后按钮切换为 buy。
- 如果用户拒签，显示错误 toast。

### 11.5 Buy Yes 交互

步骤：

1. 选择 Yes。
2. 输入 100 MockUSDC。
3. 查看 expected shares、average price、max slippage。
4. 点击 buy。
5. 钱包确认。

期望：

- 交易 pending 状态可见。
- receipt 成功后持仓刷新。
- Yes shares 增加。
- market volume 增加。
- probability 更新。

### 11.6 Buy No 交互

步骤同 Buy Yes，但选择 No。

期望：

- No shares 增加。
- Yes/No probability 更新。

### 11.7 窗口关闭展示

推进 Anvil 时间到 close time 后。

前端必须显示：

- 市场状态为 closed 或 closed waiting result。
- buy/sell 按钮禁用。
- 显示等待结果。
- 不允许继续交易。

### 11.8 Result Proposed 展示

提交结果后，前端必须显示：

- Proposed result: Yes 或 No。
- Goals detected in window。
- Evidence URI。
- 数据对比摘要。
- Challenge deadline 倒计时。
- Challenge 按钮。

### 11.9 Challenged 展示

如果触发 challenge：

- 市场状态显示 challenged。
- finalize 按钮不可用。
- 显示 challenge reason 和 evidence。

### 11.10 Redeem 展示

finalize 后：

- 获胜用户看到 redeem 按钮。
- 失败用户不显示可领取金额，或显示 payout 为 0。
- redeem 成功后持仓状态更新为 redeemed。

## 12. 前端自动化测试建议

如果加入 Playwright，建议覆盖：

- 首页 live window 渲染。
- Live Markets 筛选。
- Market Detail 展示。
- 钱包未连接状态。
- 交易按钮 disabled/enabled 状态。
- result proposed 状态。
- redeemable 状态。
- data quality verified 状态。
- data quality mismatch 阻断状态。

钱包签名流程可以先用手动测试；后续再接入自动化钱包测试工具。

## 13. 覆盖率汇总测试

完整测试必须生成三个覆盖率报告：

- `contracts/coverage/` 或 Foundry coverage 输出。
- `apps/api/coverage/`。
- `apps/web/coverage/`。

建议根命令：

```bash
bun run coverage
```

该命令应等价于：

```bash
forge coverage --root contracts
bun --cwd apps/api test --coverage
bun --cwd apps/web test --coverage
```

通过条件：

```text
contracts lines >= 95, statements >= 95, branches >= 95, functions >= 95
api       lines >= 95, statements >= 95, branches >= 95, functions >= 95
web       lines >= 95, statements >= 95, branches >= 95, functions >= 95
```

CI 或本地验收脚本必须在任一覆盖率低于 95% 时退出非零状态。

## 14. 商业级测试矩阵

商业版本不能只验证单一 happy path。每次 release candidate 必须跑完整商业测试矩阵。

### 14.1 市场类型矩阵

必须覆盖：

| 市场 | 必测路径 |
| --- | --- |
| 未来 5 分钟是否进球 | Yes、No、VAR 取消、窗口关闭后禁止交易 |
| 未来 10 分钟是否进球 | Yes、No、challenge、redeem |
| 未来 15 分钟是否进球 | 数据延迟、窗口跨半场、void/refund |
| 下一粒进球是哪队 | Team A、Team B、No goal before full time |
| 本半场是否还有进球 | 上半场、下半场、补时 |

高风险市场如角球、黄牌、球员事件必须在 staging 单独打开 feature flag 测试，未完成数据对比和争议规则前不能进入 production。

### 14.2 数据源矩阵

必须覆盖：

- FIFA official snapshot 正常。
- provider A 正常。
- provider B 正常。
- provider A 延迟。
- provider B 返回冲突数据。
- official/provider kickoff time 冲突。
- goal event 被 VAR 取消。
- provider 漏报 goal。
- provider 重复推送同一 event。
- fixture postponed。
- fixture abandoned。

通过条件：

- critical mismatch 阻断市场创建或结果提交。
- warning mismatch 进入运营后台但不阻断。
- canonical data 有明确来源和 payload hash。

### 14.3 真实盘口矩阵

必须覆盖各类比赛盘口从外部 provider 拉取真实数据：

- 赛前 moneyline 盘口。
- 赛前 handicap 盘口。
- 赛前 total 盘口。
- live goal window Yes/No 盘口。
- next goal 盘口。
- provider A 与 provider B 盘口一致。
- provider A 延迟。
- provider B 离群。
- bookmaker 盘口缺失。
- odds stale 超过阈值。
- 外部盘口和链上市场概率偏离超过阈值。

通过条件：

- `odds_snapshots` 保存 raw payload、provider timestamp、ingested timestamp、bookmaker 和 payload hash。
- `odds_comparisons` 生成 median implied probability 和 max deviation。
- stale/outlier odds 不能用于初始化市场。
- 前端能展示外部真实盘口来源、更新时间和链上概率偏离。
- 盘口异常能触发风控告警或市场暂停。
- 盘口数据不能作为唯一结算依据。

### 14.4 运营后台矩阵

必须覆盖：

- 数据审核通过。
- 数据审核拒绝。
- 市场暂停。
- 市场恢复。
- void market。
- refund。
- challenge 审查。
- finalize。
- 管理员操作审计日志。
- 非授权管理员访问被拒绝。

### 14.5 风控矩阵

必须覆盖：

- 单用户交易限额。
- 单市场交易限额。
- 滑点保护。
- close buffer 保护。
- 数据源冲突自动暂停。
- provider 延迟自动暂停。
- 外部盘口 stale 自动暂停。
- 外部盘口与链上概率偏离告警。
- 高频失败交易告警。
- 异常价格偏移告警。

### 14.6 性能矩阵

商业 release candidate 必须满足：

- 首页 p95 加载时间 < 2s。
- Market detail API p95 < 300ms。
- Live window list API p95 < 300ms。
- Indexer lag < 3 blocks。
- Live event ingest delay < 5s。
- Live odds ingest delay < 10s。
- 1000 active users 浏览 live markets 时无错误率飙升。
- 100 concurrent trade quote requests p95 < 200ms。

### 14.7 安全矩阵

必须覆盖：

- 合约重入测试。
- 过早 finalize revert。
- 非 oracle/admin 提交结果被拒绝。
- 非授权 admin route 被拒绝。
- 数据 mismatch 下强制开池被拒绝。
- 交易关闭后 buy/sell 被拒绝。
- 用户余额不足。
- allowance 不足。
- 前端错误不泄露私钥、API key 或内部堆栈。
- dependency audit 无 critical 漏洞。

## 15. 开发完成后的 Review-Fix 循环

开发完成后，不能直接宣布完成。必须进入 review-fix 环节，并且最少执行 3 次完整循环。每一轮都包含 review、fix、全量测试、记录结果。即使第一轮没有发现问题，也必须继续完成三轮。

### 15.1 循环目标

Review-fix 循环的目标是确认：

- 合约功能正确。
- 合约事件完整且可被索引。
- 后端接口行为正确。
- 数据准确性和多源对比阻断逻辑正确。
- Ponder 索引结果和链上状态一致。
- 前端展示和交互正确。
- Anvil 端到端流程完整通过。
- 合约、后端、前端覆盖率全部 >= 95%。

### 15.2 每轮必须执行的步骤

每一轮 review-fix 都必须按以下顺序执行：

1. **Review**：审查代码、合约、接口、前端状态、数据对比逻辑和测试结果。
2. **记录问题**：把发现的问题按 Critical、Important、Minor 分类。
3. **Fix**：修复 Critical 和 Important 问题；Minor 可以修复或记录为后续，但不能影响验收。
4. **全量测试**：重新运行合约、后端、前端、索引器、Anvil E2E 和覆盖率测试。
5. **验证修复**：确认本轮发现的问题不再复现。
6. **记录结果**：保存本轮 review-fix 结果、测试命令、通过/失败状态和剩余风险。

### 15.3 最少三轮要求

必须至少完成三轮：

- Round 1：重点发现明显功能、集成、数据和 UX 问题。
- Round 2：重点验证 Round 1 修复，并检查边界条件、错误路径、覆盖率缺口。
- Round 3：重点做最终回归，确认没有修复引入的新问题。

如果 Round 3 仍发现 Critical 或 Important 问题：

- 必须继续 Round 4。
- 之后每发现并修复一次 Critical 或 Important 问题，都必须再跑一轮完整 review-fix。
- 直到某一轮全量测试通过，且没有 Critical/Important 问题，才能进入完成定义。

### 15.4 每轮全量测试命令

每一轮至少运行：

```bash
forge test --root contracts -vvv
forge coverage --root contracts
bun --cwd apps/api test --coverage
bun --cwd apps/web test --coverage
bun --cwd apps/indexer test
bun run test:e2e:anvil
bun run test:commercial-matrix
bun run test:security
bun run test:performance
```

如果项目实现了统一命令，可以替换为：

```bash
bun run test:full
bun run coverage
bun run test:e2e:anvil
```

替换命令必须覆盖同等范围，不能少测。

### 15.5 每轮 Review 清单

合约 review：

- MarketFactory 是否阻止重复 window key。
- WorldCupMarket 是否正确关闭窗口交易。
- Yes/No outcome payout 是否正确。
- OptimisticResultOracle 是否阻止过早 finalize。
- challenge window 是否不可绕过。
- void/refund 是否不影响已 finalized redeem。
- 所有关键事件字段是否完整。

后端 review：

- 所有 Hono routes 是否有成功和失败测试。
- data quality mismatch 是否阻断 market creation。
- live event mismatch 是否阻断 result proposal。
- Postgres 写入是否幂等。
- viem 交易失败是否正确返回错误。
- OpenAPI 文档是否覆盖新增接口。

前端 review：

- live window 状态是否展示准确。
- data quality verified/review required 是否展示准确。
- 钱包未连接、网络错误、余额不足、授权不足是否都有提示。
- approve/buy/redeem pending 和失败状态是否正确。
- window closed 后交易按钮是否禁用。
- result proposed/challenged/redeemable 状态是否正确。

数据 review：

- official snapshot 和 provider snapshot 是否保存 payload hash。
- canonical fixture 是否只从 comparison job 生成。
- critical mismatch 是否禁止开池。
- live event comparison 是否在 propose result 前执行。
- VAR 取消进球是否不会计入 Yes。

索引 review：

- MarketCreated、TradeExecuted、ResultProposed、ResultFinalized、Redeemed 是否全部索引。
- indexed event 是否按 `chain_id + tx_hash + log_index` 幂等。
- DB market status 是否和链上状态一致。

### 15.6 Review-Fix 记录模板

每轮完成后记录：

```md
## Review-Fix Round N

### Review Scope
- Contracts:
- API:
- Indexer:
- Web:
- Data quality:
- E2E:

### Findings
- Critical:
- Important:
- Minor:

### Fixes Applied
- ...

### Full Test Results
- forge test:
- forge coverage:
- api coverage:
- web coverage:
- indexer test:
- anvil e2e:

### Remaining Risk
- ...

### Decision
- Continue to next round / Accepted after minimum 3 rounds
```

### 15.7 退出条件

只有同时满足以下条件，才能退出 review-fix：

- 至少完成 3 轮 review-fix。
- 最新一轮没有 Critical 问题。
- 最新一轮没有 Important 问题。
- 合约测试通过。
- 后端测试通过。
- 前端测试通过。
- 索引器测试通过。
- Anvil E2E 测试通过。
- 数据准确性对比测试通过。
- 合约、后端、前端覆盖率全部 >= 95%。

## 16. 完整 E2E 验收脚本

最终建议提供一个脚本：

```bash
bun run test:e2e:anvil
```

脚本应执行：

1. 检查 Postgres 可连接。
2. 检查 Anvil 可连接。
3. 部署合约。
4. 写入合约地址。
5. 运行 migration。
6. seed demo fixture。
7. 导入 official snapshot 和 provider snapshot。
8. 对比球队、赛程和场馆数据。
9. 确认 fixture data quality 为 verified。
10. 启动或调用 API 创建 live window。
11. 创建链上 market。
12. mint MockUSDC 给 USER_A 和 USER_B。
13. USER_A buy Yes。
14. USER_B buy No。
15. 推进窗口时间。
16. seed goal event。
17. 对比 live event 数据。
18. propose result。
19. 推进 challenge window。
20. finalize。
21. USER_A redeem。
22. 查询 DB 和合约状态。
23. 输出验收报告。
24. 运行合约、后端、前端覆盖率检查。
25. 确认三类覆盖率都 >= 95%。

验收报告字段：

```json
{
  "chainId": 31337,
  "contracts": {
    "mockUsdc": "0x...",
    "ctf": "0x...",
    "factory": "0x...",
    "oracle": "0x..."
  },
  "market": {
    "marketId": "...",
    "marketAddress": "0x...",
    "status": "settled",
    "winningOutcome": "Yes"
  },
  "trades": {
    "count": 2
  },
  "redemptions": {
    "winnerPaid": "..."
  },
  "checks": {
    "contractEventsIndexed": true,
    "apiHealthy": true,
    "databaseConsistent": true,
    "fixtureDataVerified": true,
    "liveEventDataVerified": true,
    "contractCoverageAtLeast95": true,
    "apiCoverageAtLeast95": true,
    "webCoverageAtLeast95": true
  },
  "coverage": {
    "contracts": {
      "lines": 95,
      "statements": 95,
      "branches": 95,
      "functions": 95
    },
    "api": {
      "lines": 95,
      "statements": 95,
      "branches": 95,
      "functions": 95
    },
    "web": {
      "lines": 95,
      "statements": 95,
      "branches": 95,
      "functions": 95
    }
  }
}
```

## 17. 手动验收清单

### 17.1 环境

- [ ] Postgres running。
- [ ] Anvil running on chain id 31337。
- [ ] Contracts deployed。
- [ ] `.env.test` has contract addresses。
- [ ] API running。
- [ ] Ponder running。
- [ ] Web running。

### 17.2 数据准确性

- [ ] Official FIFA fixture snapshot imported。
- [ ] Provider fixture snapshot imported。
- [ ] Teams compared and verified。
- [ ] Fixtures compared and verified。
- [ ] Venue and kickoff time compared and verified。
- [ ] Critical mismatch blocks market creation。
- [ ] Live events compared before result proposal。
- [ ] Critical live event mismatch blocks result proposal。
- [ ] Frontend shows data quality status。

### 17.3 覆盖率

- [ ] Contract line coverage >= 95%。
- [ ] Contract statement coverage >= 95%。
- [ ] Contract branch coverage >= 95%。
- [ ] Contract function coverage >= 95%。
- [ ] API line coverage >= 95%。
- [ ] API statement coverage >= 95%。
- [ ] API branch coverage >= 95%。
- [ ] API function coverage >= 95%。
- [ ] Web line coverage >= 95%。
- [ ] Web statement coverage >= 95%。
- [ ] Web branch coverage >= 95%。
- [ ] Web function coverage >= 95%。

### 17.4 Review-Fix

- [ ] Review-fix Round 1 completed。
- [ ] Review-fix Round 2 completed。
- [ ] Review-fix Round 3 completed。
- [ ] 每轮都运行全量测试。
- [ ] 每轮结果都已记录。
- [ ] 最新一轮无 Critical 问题。
- [ ] 最新一轮无 Important 问题。
- [ ] 如果 Round 3 后仍有 Critical/Important，已继续追加循环直到清零。

### 17.5 商业矩阵

- [ ] 多 live window 市场类型测试通过。
- [ ] 数据源延迟/冲突测试通过。
- [ ] 真实盘口 provider 拉取测试通过。
- [ ] 盘口 stale/outlier 阻断测试通过。
- [ ] 前端显示外部盘口来源、更新时间和偏离测试通过。
- [ ] 运营后台操作测试通过。
- [ ] 风控阻断测试通过。
- [ ] 性能测试达到商业 SLO。
- [ ] 安全测试无 Critical/Important 问题。

### 17.6 合约

- [ ] MockUSDC mint works。
- [ ] MarketFactory creates live goal window market。
- [ ] Duplicate market key reverts。
- [ ] Buy Yes works。
- [ ] Buy No works。
- [ ] Trading closes after window close。
- [ ] ResultProposed emitted。
- [ ] ResultFinalized emitted。
- [ ] Redeemed emitted。

### 17.7 后端

- [ ] `GET /health` ok。
- [ ] `GET /data-quality/fixtures/:id` returns verified。
- [ ] `POST /admin/data-quality/fixtures/compare` works。
- [ ] `POST /admin/data-quality/live-events/compare` works。
- [ ] `GET /fixtures?status=live` returns demo fixture。
- [ ] `POST /admin/sync/live-events` writes goal event。
- [ ] `POST /admin/live-windows/create` creates window。
- [ ] `POST /admin/markets/create` creates chain market。
- [ ] `GET /live-windows` returns market。
- [ ] `GET /markets/:id` returns detail。
- [ ] `POST /admin/results/propose` proposes result。
- [ ] `POST /admin/results/finalize` finalizes result。

### 17.8 索引器

- [ ] MarketCreated indexed。
- [ ] TradeExecuted indexed。
- [ ] ResultProposed indexed。
- [ ] ResultFinalized indexed。
- [ ] Redeemed indexed。

### 17.9 前端

- [ ] 首页显示 live match。
- [ ] Live page 显示 active window。
- [ ] Live page 显示 data quality verified。
- [ ] Market detail 显示 Yes/No。
- [ ] Market detail 显示 official/provider comparison summary。
- [ ] Wallet connects to Anvil。
- [ ] Approve works。
- [ ] Buy Yes works。
- [ ] Buy No works。
- [ ] Closed window disables trading。
- [ ] Proposed result displays。
- [ ] Redeem works。

## 18. 常见故障

### 18.1 钱包网络不对

现象：

- 前端提示 wrong network。
- 交易按钮禁用。

处理：

- 切换到 chain id `31337`。
- RPC 设置为 `http://localhost:8545`。

### 18.2 合约地址为空

现象：

- API 启动失败。
- 前端无法读取合约。

处理：

- 重新运行部署脚本。
- 更新 `.env.test` 和 `NEXT_PUBLIC_*` 地址。
- 重启 API 和 web。

### 18.3 Ponder 没有索引事件

现象：

- 合约交易成功，但数据库没有 trades。

处理：

- 检查 Ponder RPC URL。
- 检查 start block 是否早于部署 block。
- 检查合约地址配置。
- 重启 indexer。

### 18.4 窗口结果错误

现象：

- 明明有 goal，结果是 No。
- goal 被取消后结果仍为 Yes。

处理：

- 检查 `match_events`。
- 检查 live event comparison status。
- 确认 `match_second` 是否在窗口内。
- 确认 `is_confirmed` 和 `is_cancelled`。
- 检查 result worker 的 window filter。

### 18.5 Anvil 时间没有推进

现象：

- challenge deadline 一直没过。
- market 不能 finalize。

处理：

```bash
cast rpc anvil_increaseTime 700 --rpc-url http://localhost:8545
cast rpc anvil_mine 1 --rpc-url http://localhost:8545
```

### 18.6 前端状态不刷新

现象：

- 交易成功但 UI 仍显示旧状态。

处理：

- 检查 API 是否返回最新状态。
- 检查 Ponder 是否索引到事件。
- 检查前端 query invalidation。
- 手动刷新页面确认是否是缓存问题。

### 18.7 数据源不一致

现象：

- live window 创建返回 409。
- market 创建被阻止。
- result proposal 被阻止。
- 前端显示 data review required。

处理：

- 查看 `data_comparisons`。
- 对比 official snapshot 和 provider snapshot。
- 如果是 provider 延迟，等待下一次同步。
- 如果是官方赛程变化，更新 official snapshot。
- 人工确认后重新运行 comparison job。

### 18.8 覆盖率不足 95%

现象：

- `forge coverage` 低于 95%。
- `bun test --coverage` 低于 95%。
- CI coverage gate 失败。

处理：

- 查看 coverage report，定位未覆盖文件和分支。
- 优先补核心业务路径测试。
- 为错误路径、revert、data mismatch、交易失败、UI disabled 状态补测试。
- 不允许通过降低 threshold、删除测试目标、排除核心文件来通过覆盖率。

### 18.9 Review-Fix 未满三轮

现象：

- 全量测试已经通过，但 review-fix 只跑了 1-2 轮。
- 没有每轮记录。

处理：

- 继续执行剩余 review-fix 轮次。
- 每轮都必须重新运行全量测试。
- 每轮都必须记录 findings、fixes、test results 和 decision。

## 19. 商业发布完成定义

商业发布完成必须满足：

- 合约测试通过。
- API 测试通过。
- 合约、后端、前端覆盖率全部 >= 95%。
- 至少完成三轮 review-fix 循环。
- 最新 review-fix 轮次没有 Critical 或 Important 问题。
- 商业级测试矩阵全部通过。
- 性能测试达到 SLO。
- 安全测试无 Critical 或 Important 问题。
- 运营后台关键动作通过。
- Ponder 能索引所有关键事件。
- Postgres 状态和链上状态一致。
- 球队、赛程、场馆、开球时间通过 official/provider 多源对比。
- live event 在 propose result 前通过多源对比。
- 各类比赛盘口从真实 odds provider 拉取、标准化、对比并展示。
- odds stale/outlier/deviation 风控测试通过。
- 前端能完成钱包连接、approve、buy、状态展示和 redeem。
- Yes 路径和 No 路径至少各跑通一次。
- Challenge 路径至少手动跑通一次。
- 测试报告记录合约地址、market id、交易 hash、事件索引结果和最终 payout。
