# 2026 世界杯 EVM 预测市场测试文档

## 1. 测试目标

本文档定义本项目从本地 Anvil → X Layer Testnet 公开演示 → staging → 商业发布的完整测试流程。商业可运行版本必须覆盖：

- Foundry / Anvil 本地链环境。
- 合约部署、功能与事件（MockUSDC / ConditionalTokensLite / WorldCupMarketFactory / WorldCupMarket / OptimisticResultOracle）。
- Bun + Hono API 接口（含商业、风控、运营、审计路由）。
- Ponder 链上事件索引（market / trade / redemption / result_proposal / position 五张 onchain table）。
- Postgres 数据一致性（含 in-memory facade 的等价行为）。
- Next.js 前端展示与交互，特别是「比赛胜负优先」的信息架构。
- 端到端流程：部署 → 创建 `match_winner` / `exact_score` 市场 → 用户买卖 → propose → finalize → redeem。
- X Layer Testnet 上跑通对外可见的 World Cup 2026 小组赛 `match_winner` 演示市场。
- VPS 部署后浏览器走 `/api` 同源路径访问 API。

商业完整测试还必须覆盖市场矩阵、数据冗余、风控阻断、运营后台、性能与安全发布门槛，以及连续 3 轮以上的 review-fix 循环。

## 2. 测试范围

### 2.1 必测范围

- 本地 Anvil 链启动。
- 合约编译 / 单元测试 / 部署。
- MockUSDC mint / approve / transfer。
- 创建 `match_winner`、`exact_score` 商业市场（含同一 `market_key` 重复创建必须 revert）。
- 用户买 / 卖 outcome shares（3 选 1 或多 outcome）。
- close time 后禁止交易。
- propose result（带 evidence URI、payload hash）。
- challenge window 生效（默认 10 分钟，可通过 `CHALLENGE_WINDOW_SECONDS` 配置）。
- finalize 结果。
- 获胜 outcome redeem；失败 outcome payout 为 0。
- void / refund 流程。
- 合约事件被 Ponder 索引到 `market / trade / redemption / result_proposal / position` 表。
- 后端 API 在 Ponder 可用 / 不可用两种情况下都返回正确的 portfolio / settlement 数据。
- 前端首页、`/markets/[marketId]`、`/matches/[fixtureId]`（重定向）、`/portfolio`、`/settlements`、`/operator` 状态展示。
- 浏览器经 `/api` 同源路径访问 API（开发：`next.config.ts` rewrite；生产：nginx）。
- 用户通过钱包完成 approve / buy / sell / redeem。
- 合约 / 后端 / 前端覆盖率 ≥ 95%。

### 2.2 不测范围

- 未获得合规批准的真实资金公开交易。
- 未签约 provider 的生产 API SLA。
- 未审计合约的生产资金托管。
- 未批准地区的真实交易开放。

不在「测」范围 ≠ 不在「设计」范围。这些能力必须通过 feature flag、staging rehearsal 或运营流程保留。

### 2.3 覆盖率硬性门槛

合约 / 后端 / 前端覆盖率均 ≥ 95%（line / statement / branch / function）。

覆盖率低于 95% 时：

- 不允许标记测试通过。
- 不允许进入 E2E 验收完成状态。
- 不允许创建 PR 或合并。
- 必须补测试，不能通过删除未覆盖代码、降低阈值、排除核心文件来规避。

允许排除：自动生成文件、ABI JSON、构建产物、shadcn / heroui 原始生成组件、类型声明文件、demo seed 静态数据。

不能排除：合约核心逻辑、Hono route handler、service 层、数据对比逻辑、result proposal/finalize 逻辑、前端交易组件、前端状态展示组件、SDK 合约读写封装、Ponder 事件处理器。

## 3. 本地测试环境

### 3.1 必要工具

Bun / Node.js / Foundry（`forge` / `anvil` / `cast`）/ Postgres（可选，无则用 in-memory）/ 浏览器钱包。

检查：

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
- API：`http://localhost:8787`（OpenAPI JSON：`/openapi.json`，HTML index：`/docs`）
- Web：`http://localhost:3000`（浏览器经 `next.config.ts` rewrite 转发 `/api/*` 到 API）
- Postgres：`localhost:5432`
- Ponder：默认端口由 Ponder 控制；通过 schema `ponder` 与业务表隔离。

### 3.3 环境变量

`.env.local` / `.env.test`：

```bash
NODE_ENV=test

DATABASE_URL=postgres://postgres:postgres@localhost:5432/polygoal_test

CHAIN_ID=31337
RPC_URL=http://localhost:8545
PRIVATE_KEY=<anvil-account-private-key>

MOCK_USDC_ADDRESS=
CTF_ADDRESS=
MARKET_FACTORY_ADDRESS=
ORACLE_ADDRESS=

NEXT_PUBLIC_API_URL=/api
INTERNAL_API_URL=http://127.0.0.1:8787
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://localhost:8545
NEXT_PUBLIC_MOCK_USDC_ADDRESS=
NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=
NEXT_PUBLIC_ORACLE_ADDRESS=
NEXT_PUBLIC_CTF_ADDRESS=

SPORTS_DATA_PROVIDER=demo
ODDS_DATA_PROVIDERS=demo
LIVE_WINDOW_SECONDS=600
LIVE_WINDOW_CLOSE_BUFFER_SECONDS=30
LIVE_EVENT_CONFIRMATION_DELAY_SECONDS=120
CHALLENGE_WINDOW_SECONDS=600

PONDER_RPC_URL=http://localhost:8545
PONDER_START_BLOCK=0
```

## 4. 测试数据

### 4.0 数据准确性原则

球队、赛程、场馆、开球时间和 live 事件数据必须先通过多源对比才能进入市场创建或结算流程：

- FIFA 官方赛程 / 官方公告是最高优先级校验源。
- 第三方体育数据 API 只作为程序化同步源。
- 至少两份快照：`fifa_official` + `sports_data_provider`。
- canonical 数据必须由 comparison job 生成。
- 关键字段不一致时进入 `data_review_required`，禁止开池。
- 所有 payload 必须保存 raw JSON、source、source timestamp、ingested_at、payload hash。

### 4.1 Demo fixture

```json
{
  "fifaMatchId": "demo-2026-001",
  "matchNumber": 1,
  "homeTeam": "Brazil",
  "awayTeam": "Morocco",
  "status": "scheduled",
  "homeScore": 0,
  "awayScore": 0,
  "kickoffAtUtc": "2026-06-13T21:00:00.000Z",
  "venue": "MetLife Stadium"
}
```

完整 48 场小组赛见 `packages/shared/src/worldcup-2026-schedule.ts`。

### 4.2 Demo match-winner / exact-score 市场

```json
{
  "marketKey": "fixture:demo-2026-001:match_winner",
  "marketType": "match_winner",
  "outcomes": [
    { "outcomeIndex": 0, "label": "Brazil" },
    { "outcomeIndex": 1, "label": "Draw" },
    { "outcomeIndex": 2, "label": "Morocco" }
  ]
}
```

```json
{
  "marketKey": "fixture:demo-2026-001:exact_score",
  "marketType": "exact_score",
  "outcomes": [
    "0-0", "1-0", "0-1", "1-1", "2-0", "0-2", "2-1", "1-2", "2-2", "Other score"
  ]
}
```

### 4.3 Demo events（旧 goal-window 路径仍可用于合约测试）

`docs/match-winner-first-requirements.md` 把 goal-window 从 UI 移除，但 contracts/test 仍跑 Yes / No 路径作为底层验证。Demo 事件结构见 `apps/api/src/routes/admin.ts` 的 `POST /admin/sync/live-events`。

### 4.4 数据对比测试样本

`docs/data-sources.md` 列出最小样本，覆盖：

- 球队 fifa code / confederation / qualified status。
- fixture kickoff UTC / venue / stage / group。
- live event provider id / matchSecond / isConfirmed / isCancelled。
- 不一致 inject：`POST /admin/data-quality/fixtures/inject-mismatch`。

## 5. 启动顺序

### 5.1 启动 Postgres

```bash
createdb polygoal_test
# 或 Docker
docker run --name polygoal-postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=polygoal_test -p 5432:5432 -d postgres:16
psql "$DATABASE_URL" -c "select 1;"
```

### 5.2 启动 Anvil

```bash
anvil --chain-id 31337 --host 0.0.0.0 --port 8545
cast chain-id --rpc-url http://localhost:8545        # 期望 31337
```

### 5.3 编译 / 测试 / 覆盖率合约

```bash
forge build --root contracts
forge test --root contracts -vvv
bun run coverage:contracts                # forge coverage --ir-minimum
```

期望：编译成功；所有 Foundry 测试通过；覆盖率 ≥ 95%。

### 5.4 部署合约

```bash
forge script contracts/script/Deploy.s.sol \
  --rpc-url http://localhost:8545 \
  --broadcast \
  --private-key "$PRIVATE_KEY"
```

记录 `MOCK_USDC_ADDRESS / CTF_ADDRESS / MARKET_FACTORY_ADDRESS / ORACLE_ADDRESS`，写入 `.env.test` 和 `NEXT_PUBLIC_*`。

也可用 Solidity-only 流程：

```bash
bun run contracts:flow              # 自管理 anvil + Deploy + 端到端
```

X Layer Testnet：

```bash
PRIVATE_KEY=0x... bun run deploy:xlayer:infra
PRIVATE_KEY=0x... bun run deploy:xlayer:markets
# 部署结果回写 deployments/xlayer-testnet.json
```

### 5.5 数据库迁移 + seed

```bash
bun --cwd packages/db migrate
bun --cwd packages/db seed:test
```

验收：

```bash
psql "$DATABASE_URL" -c "select count(*) from fixtures;"
psql "$DATABASE_URL" -c "select count(*) from markets;"
```

期望：fixtures ≥ 1；markets 等待 admin job 或 `POST /admin/markets/bootstrap-schedule` 创建。

### 5.6 数据源快照导入与对比

```bash
bun apps/api/scripts/import-official-snapshot.ts --fixture demo-2026-001
bun apps/api/scripts/import-provider-odds.ts --fixture demo-2026-001
curl -X POST http://localhost:8787/admin/data-quality/fixtures/compare \
  -H "content-type: application/json" \
  -d '{"fixtureId":"demo-2026-001"}'
```

验收：

```sql
select source, payload_hash from data_source_snapshots;
select status, critical_mismatch_count
from data_comparisons
where subject_key = 'fixture:demo-2026-001';
```

期望：`fifa_official` 与 `sports_data_provider` 至少各 1 条；`status = verified`；`critical_mismatch_count = 0`；存在 critical mismatch 时 `POST /admin/markets/create` / `POST /admin/markets/commercial` 必须 409。

### 5.7 启动 API

```bash
bun --cwd apps/api dev
curl http://localhost:8787/health      # {"ok": true}
```

### 5.8 启动 Ponder

```bash
bun --cwd apps/indexer dev
```

期望：

- 无错误启动；连接 RPC（local Anvil 或 X Layer）；连接 Postgres（或 pglite）。
- `ponder` schema 自动创建；`market / trade / redemption / result_proposal / position` 表存在。

### 5.9 启动前端

```bash
bun --cwd apps/web dev
open http://localhost:3000
```

验收：

- 首页可见，按日期分组的赛程；如果有 live 比赛单独排在顶部。
- 控制台无未捕获异常。
- 钱包连接按钮可见。

## 6. 合约功能测试

### 6.1 MockUSDC

- decimals 为 6。
- mint / approve / transferFrom 成功。

```bash
cast call "$MOCK_USDC_ADDRESS" "decimals()(uint8)" --rpc-url "$RPC_URL"
cast send "$MOCK_USDC_ADDRESS" "mint(address,uint256)" "$USER_A" 1000000000 \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY"
```

### 6.2 创建 match_winner 市场

通过 `WorldCupMarketFactory.createMarket(...)`：

- fixture id: `demo-2026-001`
- market key: `fixture:demo-2026-001:match_winner`
- outcome count: 3
- close time: kickoff + close buffer（match-winner 默认 +105 分钟覆盖常规时间 + 补时）
- resolution policy hash: `keccak256("full_time_match_winner_excluding_extra_time_and_penalties")`

测试点：

- 创建成功，`MarketCreated` 事件包含 8 个字段（marketId / marketKey / fixtureId / windowStart / windowEnd / market / conditionId / outcomeCount）。
- 同一 market key 再次创建必须 revert。
- ConditionPrepared 写入 CTF。

### 6.3 买 outcome

`USER_A` mint + approve + buy outcome 0（Home）；`USER_B` buy outcome 1（Draw）；`USER_C` buy outcome 2（Away）。

事件：`Approval` / `Transfer` / `PositionSplit` / `TradeExecuted(outcomeIndex, tradeType=0)`。

### 6.4 卖出 outcome

时间未到 close time 前调用 sell，期望 `TradeExecuted(tradeType=1)`，position 减少。

### 6.5 close time 后禁止交易

```bash
cast rpc anvil_setNextBlockTimestamp <closeTime+1> --rpc-url "$RPC_URL"
cast rpc anvil_mine 1 --rpc-url "$RPC_URL"
```

任意 buy / sell 必须 revert（`MarketClosed` / `TradingClosed`）。

### 6.6 propose result

`POST /admin/results/propose`，或直接 cast 调用 Oracle。

事件：`ResultProposed(marketId, proposalId, proposer, winningOutcome, payloadHash, challengeDeadline)`。

DB / Ponder：

- in-memory facade 写 `result_proposals` 表。
- Ponder 写 `ponder.result_proposal`，`status = proposed`。

### 6.7 challenge

challenge window 内调用 challenge：

- Oracle 发 `ResultChallenged(marketId, challenger, reason, evidenceUri)`。
- Ponder：`status = challenged`。
- API `/settlements?status=challenged` 返回该 proposal。
- 前端 `/settlements` 显示 challenged tab。

### 6.8 finalize

challenge window 结束 + 无人挑战时：

```bash
cast rpc anvil_increaseTime "$CHALLENGE_WINDOW_SECONDS" --rpc-url "$RPC_URL"
cast rpc anvil_mine 1 --rpc-url "$RPC_URL"
```

调用 `finalize(marketId)` 或 `POST /admin/results/finalize`：

- Oracle 发 `ResultFinalized(marketId, winningOutcome, payoutNumerators, payoutDenominator)`。
- Ponder：`status = finalized`。
- Market 状态在 API 经 `getMarketStatusOverlay` 覆盖为 `redeemable`。

### 6.9 redeem

获胜 outcome 持仓人调用 redeem：

- 失败 outcome payout 为 0。
- 获胜 outcome 按 payout vector 取回 collateral。
- 事件：`Redeemed(marketId, user, outcomeIndex, sharesBurned, collateralPaid)`。
- Ponder：append `redemption`，`position.sharesRaw -= sharesBurned`、`position.redeemedRaw += collateralPaid`。

### 6.10 void / refund

`POST /admin/markets/:marketId/void` → Oracle `MarketVoided`；Ponder `status = voided`。
`POST /admin/markets/:marketId/refund` → queued refund，运营审计可见。

## 7. 合约事件清单

| 操作 | 事件 | 必须包含字段 |
| --- | --- | --- |
| 创建 condition | `ConditionPrepared` | `conditionId, oracle, questionId, outcomeSlotCount` |
| 创建 market | `MarketCreated` | `marketId, marketKey, fixtureId, windowStartMatchSecond, windowEndMatchSecond, market, conditionId, outcomeCount` |
| 买卖 outcome | `TradeExecuted` | `marketId, trader, outcomeIndex, collateralAmount, sharesAmount, tradeType` |
| 拆分 collateral | `PositionSplit` | 标准 CTF 事件 |
| 合并 outcome | `PositionMerged` | 标准 CTF 事件 |
| 提交结果 | `ResultProposed` | `marketId, proposalId, proposer, winningOutcome, payloadHash, challengeDeadline` |
| 挑战 | `ResultChallenged` | `marketId, challenger, reason, evidenceUri` |
| finalize | `ResultFinalized` | `marketId, winningOutcome, payoutNumerators, payoutDenominator` |
| void | `MarketVoided` | `marketId, market` |
| redeem | `Redeemed` | `marketId, user, outcomeIndex, sharesBurned, collateralPaid` |

## 8. 后端接口测试

### 8.0 覆盖率

```bash
bun --cwd apps/api test --coverage
```

必须覆盖：Hono route handler、request validation、error handler、sports data adapter、data quality comparison、live window service、market service、settlement service、`PonderReader`、operator service、risk service、provider health service、viem transaction wrapper、Postgres query helper、OpenAPI spec generation 的关键路径。

任一指标 < 95%、route handler 只测 happy path、data quality mismatch 阻断逻辑没有测试、result proposal 在未 verified 数据下被允许 = 视为失败。

### 8.1 Health

```bash
curl -s http://localhost:8787/health
```

### 8.2 数据源对比

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

阻断场景下 `status = data_review_required`，`POST /admin/markets/create` 返回 409。

### 8.3 商业市场

```bash
curl -s "http://localhost:8787/commercial-markets?fixtureId=demo-2026-001"
curl -s "http://localhost:8787/commercial-markets?marketType=match_winner"
```

期望：返回 `match_winner` 和 `exact_score` 两条；outcome label / providerOdds / impliedProbabilityBps / lastUpdatedAt / source 完整。

### 8.4 Schedule

```bash
curl -s "http://localhost:8787/schedule"
```

期望：48 场小组赛或 demo fixture，按 kickoff 排序。

### 8.5 Markets

```bash
curl -s "http://localhost:8787/markets?status=live_trading"
curl -s "http://localhost:8787/markets/fixture:demo-2026-001:match_winner"
```

期望：`outcomes` 长度 = 3；`oracleState` 在 Ponder 可用时反映链上真实状态；`marketAddress` 取自 `deployments/xlayer-testnet.json`（如果是 X Layer）。

### 8.6 Settlements

```bash
curl -s "http://localhost:8787/settlements?status=proposed"
curl -s "http://localhost:8787/settlements?status=finalized"
```

期望：

- 当 Ponder schema 存在时，结果来自 `ponder.result_proposal`。
- `challengeDeadline` 为 ISO 时间；`txHash` 优先返回 finalized tx，其次 proposed tx。

### 8.7 Portfolio（关键回归）

```bash
curl -s "http://localhost:8787/portfolio/0xUSER_A"
```

期望：

- Ponder 中存在该钱包交易时直接返回 indexer 数据。
- 没有任何 indexer 数据时回退 in-memory（含 `seed-demo-portfolio` 数据）。
- 不应出现「真实钱包混入 demo seed」的情况。

### 8.8 Operator console 流程

按 `apps/api/src/routes/commercial.ts` 顺序覆盖：

```text
POST /admin/feature-flags/:flag
POST /admin/risk/limits
POST /admin/provider-health
POST /admin/provider-health/auto-pause
POST /admin/markets/:marketId/pause
POST /admin/markets/:marketId/resume
POST /admin/challenges
POST /admin/challenges/:challengeId/review
POST /admin/markets/:marketId/void
POST /admin/markets/:marketId/refund
GET  /admin/audit-logs
```

每个动作必须写 audit log；权限缺失返回 403。

### 8.9 Same-origin /api 验证

```bash
curl -s "http://localhost:3000/api/health"           # next.config.ts rewrite
curl -s "http://VPS_IP/api/health"                    # nginx 反代
```

期望：两条都返回 `{"ok": true}`，无 CORS / Private Network Access 错误。

## 9. Ponder 索引测试

### 9.1 market 表

```sql
select market_key, market_address, condition_id, outcome_count
from ponder.market
where market_key = 'fixture:demo-2026-001:match_winner';
```

期望 outcome_count = 3。

### 9.2 trade 表

```sql
select trader, outcome_index, collateral_amount_raw::text, shares_amount_raw::text, trade_type
from ponder.trade
where market_address = lower('<market-address>')
order by block_number, log_index;
```

期望：买卖记录与链上一致；tradeType 0 = buy / 1 = sell。

### 9.3 result_proposal 表

```sql
select status, winning_outcome, challenge_deadline::text
from ponder.result_proposal
where market_id = '<marketId>';
```

期望：从 `proposed` 经 `challenged?` 到 `finalized` / `voided` 的状态机覆盖。

### 9.4 redemption 表

```sql
select "user", outcome_index, collateral_paid_raw::text
from ponder.redemption
where market_id = '<marketId>';
```

期望：获胜用户有 payout；失败用户 0 或无记录。

### 9.5 position 表

```sql
select trader, outcome_index, shares_raw::text, redeemed_raw::text
from ponder.position
where market_address = lower('<market-address>');
```

期望：`shares_raw` = buy 总和 - sell 总和 - burned；`redeemed_raw` = 累计 payout。

## 10. 数据准确性测试

同前一版本：球队、赛程、live 事件多源对比；critical mismatch 阻断市场创建与结果提交。阻断 inject：`POST /admin/data-quality/fixtures/inject-mismatch`。

`match_winner` 特定校验：

- home / away team mismatch → 阻断。
- kickoff UTC 不一致 → 阻断（影响 close time 计算）。
- 场馆 mismatch → warning（不影响结算）。

`exact_score` 特定校验：

- 比分盘口 outcome label 必须能映射回内部 `0-0 / 1-0 / ... / Other score`。
- provider 缺少常见比分时，前端展示 `No provider odds`，但市场仍可保留。

## 11. 前端展示测试

### 11.0 覆盖率

```bash
bun --cwd apps/web test --coverage
```

Vitest threshold ≥ 95%。覆盖：

- 首页赛程分组 + Live 区。
- `/markets/[marketId]` match-winner / exact-score tab 切换。
- `/matches/[fixtureId]` 重定向。
- `/portfolio` 持仓 + 余额 + faucet。
- `/settlements` 时间线分组。
- `/operator` 控制台。
- wallet connect 状态。
- approve / buy / sell / redeem 按钮状态机。
- DataFreshnessBadge / DeviationBadge / TxStatusBadge。
- API client error handling。
- viem read / write wrapper。

允许不计入：heroui 原始组件、Next layout metadata、静态图标 / 样式。

### 11.1 首页

打开 `http://localhost:3000`，必须看到：

- PageHero（标题 + 主 CTA）。
- DayJumper（顶部快速跳转：Live、Today、Tomorrow、按日期）。
- 如果有 live match 单独排在最上方。
- 每张 FixtureRow 展示队伍、比分、状态、是否可交易 match_winner / exact_score。
- 控制台无错误。

### 11.2 比赛胜负优先

不应出现：

- `Tradeable goal window`。
- `5-minute / 10-minute / 15-minute goal window`。
- 任何把 goal window 当主入口的卡片或导航。

应出现：

- `Pick the match result` / `Featured match markets` 等胜负文案。
- 比赛卡片直达 `Match Winner` 市场。

### 11.3 市场详情页

`/markets/fixture:demo-2026-001:match_winner` 必须看到：

- FixtureHero（队伍、kickoff、状态、场馆）。
- 默认 `Match Winner` tab：Home / Draw / Away 三个 OutcomeCard。
- 次级 tab `Exact Score`（点击切换不触发整页重渲）。
- TradeTicket：amount 输入、expected shares、avg price、max slippage、potential payout、submit。
- SettlementRules（结算规则说明）。
- MatchEventsList（实时比赛事件流）。

数据来源验证：

- API 没有该商业市场时 `EmptyState`。
- Ponder 已 finalize 时显示 `redeemable` 状态。

### 11.4 Approve / Buy / Sell

- 未连接钱包 → 按钮显示 `Connect wallet`。
- 已连接 + allowance 不足 → `Approve` → loading → 成功后切换到 `Buy`。
- 提交后 TxStatusBadge：pending-signature → pending-tx → indexed / failed。
- Pony lit 错误 toast：用户拒签、余额不足、滑点过高。

### 11.5 关闭后

`cast rpc anvil_setNextBlockTimestamp <closeTime+1>` 后刷新页面：

- 状态切到 `closed`。
- TradeTicket 禁用，提示 `Trading closed`。
- 不影响持仓 / 结算视图。

### 11.6 Settlements 时间线

`/settlements` 必须按 `Proposed / Challenged / Finalized / Voided` 分组，每个 SettlementRow 展示：

- 市场名 / fixture / outcomes。
- 提议结果与证据 URI。
- challenge deadline 倒计时。
- 链上 tx hash（点击跳浏览器）。

### 11.7 Portfolio

`/portfolio` 钱包未连接时显示 `Connect wallet`；连接后：

- BalanceFaucet 提供 mint Mock USDC（仅本地 / 测试网）。
- PortfolioSummary 显示总 PnL、可赎回金额、未结算金额。
- PositionGroup 按 `Live / Awaiting result / Redeemable / Voided / Settled` 分组。
- PositionRow 显示市场 / outcome / 持仓 shares / collateral in / 当前估值 / redeem 按钮。

数据来源：API 内部 PonderReader 决定真链上 vs in-memory，UI 不感知。

## 12. 前端自动化测试建议

如果加入 Playwright，建议覆盖：

- 首页赛程渲染 + Live 区。
- `/matches/[fixtureId]` 重定向到 `/markets/{fixtureId}:match_winner`。
- 市场详情 match_winner / exact_score tab 切换。
- 钱包未连接 / 连接状态。
- 交易按钮 disabled / enabled。
- result proposed / challenged / redeemable 状态。
- data quality verified / review-required 状态。

钱包签名流程先用 Anvil 自动账户脚本辅助；商业版接入自动化钱包测试工具。

## 13. 覆盖率汇总

```bash
bun run coverage
```

等价于 `bun run coverage:contracts && bun run coverage:ts`，输出：

- `contracts/coverage/`（Foundry）
- TS 覆盖率（bun test --coverage，包括 apps/ packages/ scripts/）

通过条件：三类指标全部 ≥ 95%；CI 任一低于 95% 退出非零。

## 14. 商业级测试矩阵

### 14.1 市场类型矩阵

| 市场 | 必测路径 |
| --- | --- |
| `match_winner` | Home / Draw / Away 三方 buy + sell；close time 后禁止交易；propose / finalize 三种 outcome；challenge + reject；void + refund |
| `exact_score` | 常见比分 buy；`Other score` buy；provider odds 缺失时 fallback；mismatched outcome label 阻断 |
| `goal_window`（底层保留） | Yes / No / VAR 取消；窗口关闭；测试由 contracts/test 守护 |

### 14.2 数据源矩阵

- FIFA official snapshot 正常 / provider A 正常 / provider B 正常 / 延迟 / 冲突。
- official 与 provider kickoff 冲突 → 阻断。
- VAR 取消 / provider 漏报 / 重复推送（旧 goal_window 测试链路保留）。
- fixture postponed / abandoned 状态切换。

### 14.3 真实盘口矩阵

- 赛前 1X2（驱动 `match_winner` 初始概率）。
- 赛前 exact score / correct score。
- live moneyline 偏移触发风控。
- provider A / B 一致 / 离群 / 延迟。
- bookmaker feed 缺失时前端展示 `No provider odds`。
- 外部盘口与链上市场概率偏离超阈值。

通过条件：odds_snapshots 保存 raw payload + payload hash；odds_comparisons 生成 median + max deviation；stale / outlier odds 不能用于初始化市场；前端展示来源 / 时间 / 偏离；偏离能触发风控告警或市场暂停。

### 14.4 运营后台矩阵

数据审核通过 / 拒绝、市场暂停 / 恢复、void / refund、challenge 审查、finalize、管理员操作审计、非授权访问被拒。

### 14.5 风控矩阵

单用户限额、单市场限额、滑点、close buffer、数据源冲突自动暂停、provider 延迟自动暂停、外部盘口 stale 自动暂停、偏离告警、高频失败告警、异常价格偏移。

### 14.6 性能矩阵（商业 SLO）

- 首页 p95 < 2s。
- Market detail API p95 < 300ms。
- Schedule API p95 < 300ms。
- Settlement API p95 < 300ms（含 Ponder 查询）。
- Indexer lag < 3 blocks。
- Live event ingest delay < 5s。
- Live odds ingest delay < 10s。
- 1000 active users 浏览市场无错误率飙升。
- 100 concurrent trade quote requests p95 < 200ms。

### 14.7 安全矩阵

合约重入、过早 finalize、非 oracle / admin 提交结果被拒、非授权 admin route 被拒、数据 mismatch 强制开池被拒、close time 后 buy / sell 被拒、余额 / allowance 不足、前端不泄露私钥 / API key / 内部堆栈、dependency audit 无 critical 漏洞。

## 15. Review-Fix 循环（≥ 3 轮）

开发完成后强制进入 review-fix 环节，最少 3 轮，每轮包含：

1. **Review**：合约 / API / Ponder / Web / 数据对比 / E2E。
2. **记录问题**：Critical / Important / Minor 分类。
3. **Fix**：修复 Critical 与 Important；Minor 可记录跟进。
4. **全量测试**：再跑全部命令。
5. **验证修复**：本轮发现问题不再复现。
6. **记录结果**：findings / fixes / test results / decision。

辅助脚本：

```bash
bun run review-fix
```

每轮全量测试命令：

```bash
forge test --root contracts -vvv
bun run coverage:contracts
bun --cwd apps/api test --coverage
bun --cwd apps/web test --coverage
bun --cwd apps/indexer typecheck
bun run test:e2e:anvil
bun run test:commercial-matrix
bun run test:security
bun run test:performance
bun run test:postgres
```

如果有统一命令：

```bash
bun run test:full
```

Round 1：明显功能 / 集成 / 数据 / UX 问题。
Round 2：验证 Round 1 修复 + 边界条件 + 错误路径 + 覆盖率缺口。
Round 3：最终回归。
Round 3 仍有 Critical / Important → 继续 Round 4，每次修复都重跑一轮，直到清零。

### 15.5 每轮 Review 清单

合约 review：

- MarketFactory 阻止重复 `market_key`。
- WorldCupMarket 关闭交易（close time）。
- 各 outcome payout 正确。
- OptimisticResultOracle 阻止过早 finalize。
- challenge window 不可绕过。
- void / refund 不影响已 finalized redeem。
- 关键事件字段完整。

后端 review：

- 所有 Hono routes 有成功 + 失败测试。
- data quality mismatch 阻断 market creation。
- live event mismatch 阻断 result proposal。
- Postgres 写入幂等。
- viem 交易失败正确返回错误。
- OpenAPI 文档覆盖新增接口。
- PonderReader fallback 行为正确（indexer 不可用 → in-memory）。

前端 review：

- 首页 / `/markets/[marketId]` / `/matches/[fixtureId]` / `/portfolio` / `/settlements` / `/operator` 状态展示准确。
- 钱包未连接、网络错误、余额不足、授权不足有提示。
- approve / buy / sell / redeem pending 与失败状态正确。
- close time 后交易按钮禁用。
- result proposed / challenged / redeemable 状态正确。
- 比赛胜负优先信息架构落地，无 goal-window 入口。

数据 review：

- official + provider snapshot 保存 payload hash。
- canonical fixture 只从 comparison job 生成。
- critical mismatch 禁止开池。
- VAR 取消进球不会计入 Yes（旧 goal_window 路径）。

索引 review：

- MarketCreated / TradeExecuted / Redeemed / ResultProposed / ResultChallenged / ResultFinalized / MarketVoided 全部索引。
- indexed event 按 `tx_hash + log_index` 幂等。
- DB / Ponder 状态和链上一致。

### 15.6 记录模板

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

## 16. 完整 E2E 验收脚本

```bash
bun run test:e2e:anvil
```

执行：

1. 检查 Postgres 可连接（或回退 in-memory）。
2. 检查 Anvil 可连接。
3. 部署合约。
4. 写入合约地址。
5. 运行 migration。
6. seed demo schedule。
7. 导入 official + provider snapshot。
8. 对比球队 / 赛程 / 场馆数据。
9. 确认 fixture data quality verified。
10. 启动 / 调用 API 创建 match_winner 市场。
11. 创建链上 market。
12. mint MockUSDC 给 USER_A / B / C。
13. 用户分别买 Home / Draw / Away。
14. 推进时间至 close time 后。
15. propose result。
16. 推进 challenge window。
17. finalize。
18. 获胜用户 redeem。
19. 查询 DB + 链上状态。
20. 输出验收报告。
21. 跑合约 / 后端 / 前端覆盖率。
22. 确认三类覆盖率 ≥ 95%。

验收报告字段：

```json
{
  "chainId": 31337,
  "contracts": { "mockUsdc": "0x...", "ctf": "0x...", "factory": "0x...", "oracle": "0x..." },
  "market": {
    "marketKey": "fixture:demo-2026-001:match_winner",
    "marketAddress": "0x...",
    "status": "settled",
    "winningOutcomeLabel": "Brazil"
  },
  "trades": { "count": 3 },
  "redemptions": { "winnerPaid": "..." },
  "checks": {
    "contractEventsIndexed": true,
    "apiHealthy": true,
    "databaseConsistent": true,
    "fixtureDataVerified": true,
    "ponderSchemaPresent": true,
    "contractCoverageAtLeast95": true,
    "apiCoverageAtLeast95": true,
    "webCoverageAtLeast95": true
  }
}
```

## 17. 手动验收清单

### 17.1 环境

- [ ] Postgres running（或 in-memory 模式声明）
- [ ] Anvil running on chainId 31337 / X Layer 1952 可达
- [ ] Contracts deployed（地址写入 `.env` + `deployments/xlayer-testnet.json`）
- [ ] API running，`/health` 返回 ok
- [ ] Ponder running，`ponder` schema 存在
- [ ] Web running，`http://localhost:3000` 可见

### 17.2 数据准确性

- [ ] Official FIFA fixture snapshot imported
- [ ] Provider fixture snapshot imported
- [ ] Teams / fixtures / venues / kickoff compared and verified
- [ ] Critical mismatch blocks market creation
- [ ] Live events compared before result proposal
- [ ] Frontend shows data quality status

### 17.3 覆盖率

- [ ] Contracts line / statement / branch / function ≥ 95%
- [ ] API line / statement / branch / function ≥ 95%
- [ ] Web line / statement / branch / function ≥ 95%

### 17.4 Review-Fix

- [ ] Round 1 / 2 / 3 完成
- [ ] 每轮全量测试 + 记录
- [ ] 最新一轮无 Critical / Important
- [ ] Round 3 后仍有问题已追加循环直到清零

### 17.5 商业矩阵

- [ ] match_winner 三方 outcome 测试通过
- [ ] exact_score 常见比分 + Other score 测试通过
- [ ] 数据源延迟 / 冲突测试通过
- [ ] 真实盘口拉取 + 标准化 + 对比测试通过
- [ ] 盘口 stale / outlier 阻断测试通过
- [ ] 前端显示外部盘口来源 / 时间 / 偏离测试通过
- [ ] 运营后台操作 + 审计日志测试通过
- [ ] 风控阻断测试通过
- [ ] 性能 SLO 达标
- [ ] 安全无 Critical / Important 问题

### 17.6 合约

- [ ] MockUSDC mint works
- [ ] MarketFactory 创建 match_winner / exact_score 市场
- [ ] 重复 market key revert
- [ ] Buy / Sell works
- [ ] close time 后交易关闭
- [ ] ResultProposed / ResultFinalized / Redeemed emitted

### 17.7 后端

- [ ] `GET /health`
- [ ] `GET /schedule`
- [ ] `GET /commercial-markets?fixtureId=...`
- [ ] `GET /markets/:id`
- [ ] `GET /settlements`
- [ ] `GET /portfolio/:wallet`（Ponder 优先）
- [ ] `POST /admin/data-quality/fixtures/compare`
- [ ] `POST /admin/markets/commercial`
- [ ] `POST /admin/markets/:id/{pause,resume,void,refund}`
- [ ] `POST /admin/challenges`、`POST /admin/challenges/:id/review`
- [ ] `POST /admin/results/{propose,finalize}`
- [ ] `GET /admin/audit-logs`

### 17.8 索引器

- [ ] MarketCreated indexed
- [ ] TradeExecuted indexed
- [ ] ResultProposed / Challenged / Finalized indexed
- [ ] Redeemed indexed
- [ ] MarketVoided indexed

### 17.9 前端

- [ ] 首页按日期分组显示 schedule + Live
- [ ] `/markets/[marketId]` match-winner 默认；`/exact_score` 切换可用
- [ ] `/matches/[fixtureId]` 自动重定向
- [ ] `/portfolio` 持仓 + faucet
- [ ] `/settlements` 时间线
- [ ] `/operator`（feature flag 打开时）
- [ ] 钱包 connect / disconnect / wrong-network 状态
- [ ] Approve / Buy / Sell / Redeem 状态机
- [ ] close time 后交易禁用
- [ ] 数据 quality 阻断展示

## 18. 常见故障

### 18.1 钱包网络不对

- 切换到 chain id `31337` 或 X Layer Testnet `1952`。
- RPC 设置为对应 endpoint。

### 18.2 合约地址为空

- 重新跑部署脚本；地址写回 `.env` + `deployments/xlayer-testnet.json`。
- 重启 API + web；前端 `NEXT_PUBLIC_*` 通过 build-time 注入。

### 18.3 Ponder 没有索引事件

- 检查 `PONDER_RPC_URL`、`PONDER_START_BLOCK`。
- 检查 factory / oracle 地址是否与 `deployments/xlayer-testnet.json` 一致。
- 检查 `DATABASE_URL`。
- 重启 indexer。

### 18.4 窗口结果错误

- 检查 `match_events`。
- 检查 live event comparison status。
- 确认 `match_second` 在窗口内。
- 确认 `is_confirmed` / `is_cancelled`。

### 18.5 Anvil 时间没有推进

```bash
cast rpc anvil_increaseTime 700 --rpc-url http://localhost:8545
cast rpc anvil_mine 1 --rpc-url http://localhost:8545
```

### 18.6 前端状态不刷新

- API 是否返回最新状态。
- Ponder 是否索引到事件。
- 前端 cache：相关页面已 `dynamic = "force-dynamic"`，必要时手动刷新。

### 18.7 数据源不一致

- 查看 `data_comparisons`。
- 对比 official / provider snapshot。
- provider 延迟 → 等待下一次同步；官方变更 → 更新 official snapshot；人工确认后重跑 comparison job。

### 18.8 覆盖率不足 95%

- 查 coverage report，定位未覆盖文件 / 分支。
- 优先补核心业务路径；为 revert、data mismatch、tx failure、UI disabled 补测。
- 不允许降低 threshold、删除测试目标、排除核心文件。

### 18.9 Review-Fix 未满三轮

- 继续完成剩余轮次；每轮重跑全量测试 + 记录。

### 18.10 `/api` 同源访问失败

- 本地：检查 `apps/web/next.config.ts` 的 rewrite 是否生效；`INTERNAL_API_URL` 是否指向真正的 API 端口。
- VPS：检查 nginx 配置（参考 `scripts/deploy-vps-remote-provision.sh`）；浏览器是否被 PNA 阻断（检查响应头是否带 `Access-Control-Allow-Private-Network: true`）。

## 19. 商业发布完成定义

- 合约 / API / Web 测试通过。
- 三类覆盖率 ≥ 95%。
- 至少完成 3 轮 review-fix。
- 最新 review-fix 无 Critical / Important。
- 商业测试矩阵全部通过。
- 性能达标，安全无 Critical / Important。
- 运营后台关键动作通过审计。
- Ponder 索引所有关键事件。
- DB / Ponder / 链上状态一致。
- 球队 / 赛程 / 场馆 / 开球时间通过多源对比。
- live event 在 propose result 前通过多源对比。
- match_winner / exact_score 真实盘口拉取 + 标准化 + 对比 + 展示。
- odds stale / outlier / deviation 风控测试通过。
- 前端能完成钱包连接、approve、买卖、状态展示、redeem。
- match_winner 三方 outcome 与 exact_score 常见比分各跑通一次。
- challenge 路径至少手动跑通一次。
- void / refund 路径跑通。
- 测试报告记录合约地址、market key、交易 hash、事件索引结果和最终 payout。
