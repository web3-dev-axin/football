# 前端重设计方案 (Consumer Surface)

- 日期: 2026-05-19
- 范围: 消费者面（首页 / 赛程 / 比赛页 / 市场详情 / 持仓 / 结算）；**运营台不重设计**，仅保留入口
- 上游需求: `docs/match-winner-first-requirements.md`
- 后端 API: `apps/api/src/routes/*` (47 路由) — 详见附录 A
- 合约: `WorldCupMarket` + `OptimisticResultOracle` + `ConditionalTokensLite` + `WorldCupMarketFactory`
- 当前前端: `apps/web/`（Next.js 15 App Router + React 19）

## 1. 为什么重设计

当前 `apps/web/` 与后端/合约能力严重错位，用户拿到的几乎是一个高保真 demo 而非可交易产品。具体问题：

1. **IA 断裂**：`/live`、`/schedule`、`/settlement` 都只 `redirect("/")`，导航只有 *Markets / Portfolio* 两项。
2. **首页 100% demo 数据**：首页用 `InMemoryDb` seed，用户看到的"Brazil vs Morocco 63 分钟"是写死的，而非来自 `/schedule` + `/fixtures?status=live`。
3. **交易表单永远买 outcome=0**：`TradeForm` 没有 outcome selector，无论用户视觉上点哪个，最终发的链上 tx 都是 outcome index 0。
4. **比分模块是静态 mock**：`MarketDetail` 的 exact-score 网格写死了 `6.20 / provider_a / 固定 UTC`，违反需求文档"必须接入真实 provider 盘口或显示数据缺失"。
5. **品牌混乱**：`metadata.title = "polygoal"`、`BrandMark = polygoal logo`、`PageHero.eyebrow = "Clean Stadium"`、组件里到处是 `oracle / bps / provider_a / market-demo-*`。
6. **运营台公开**：`/operator` 与零售页用同一 chrome，无任何权限校验，能被任意用户访问。
7. **钱包状态分裂**：导航的 `WalletStatus` 与每个交易表单各自实例化 `useInjectedWallet()`，没有跨组件共享。
8. **持仓 KPI 全假**：`/portfolio` 顶部三张 StatCard 是硬编码 `100 Brazil / 100 USDT / 状态`，与 `/portfolio/:wallet` 返回的真实持仓没有关系。
9. **结算无独立闭环**：`SettlementPanel` 同时贴在市场页和持仓页，没有"我可以从哪里看到全部待结算/可赎回"的入口。
10. **discovery 死路**：`MarketMatrixPanel` 的卡片**没有任何链接**，赛程页根本不存在，用户没有从一个场景跳到下一个场景的路径。

## 2. 设计原则

| 原则 | 含义 |
|---|---|
| **Market-first** | 首页 = 热门胜负平市场列表，按交易量 / 截止时间排序（Polymarket 风格）。不让用户先看一场固定 demo 比赛。 |
| **Match-winner P0 / Exact-score P1** | 任何 `match_winner` 必须出现在主路径；`exact_score` 只作为 fixture 页/市场页的次级 tab，且仅在 `providerOdds.status === "verified"` 时展示真实赔率。 |
| **零黑话** | 用户面**不出现** `oracle / bps / provider_a / market-demo / Clean Stadium / on air / standby / data quality: verified / live window`。所有概率以百分比展示，引用源用人话："Pinnacle 更新 12 秒前"。 |
| **真实优先，缺失透明** | 任何来自 `/markets`、`/commercial-markets`、`/portfolio/:wallet` 的字段必须区分"已加载/加载中/数据缺失"。fallback 到 demo 数据时**必须挂明显的 Badge**。 |
| **3 秒可交易** | 用户落到任意 `match_winner` 市场页，首屏必须同时看到：比赛对阵、当前比分/时间、3 个 outcome 概率、买入金额输入框、预计 payout、Connect Wallet CTA。 |
| **移动优先** | 所有交易关键路径在 ≤375px 宽度可单手完成；底部 tab bar 保留，但调整为 4 项。 |
| **状态机驱动** | 不再让组件内 `useState` 自由演化，由统一的 `MarketStatus`、`TxState`、`OracleState` 决定 UI。 |

## 3. 信息架构 (IA)

### 3.1 路由表

| 路径 | 状态 | 用途 | 数据来源 |
|---|---|---|---|
| `/` | **重写** | Markets-first 列表：所有可交易/即将开赛的胜负平市场，可按 fixture / status / volume 筛选 | `GET /commercial-markets?marketType=match_winner` + `GET /fixtures` |
| `/schedule` | **新建（替换 redirect）** | 完整 2026 世界杯 72 场小组赛 + 淘汰赛占位，按日期分组 | `GET /schedule` + `GET /commercial-markets` |
| `/matches/[fixtureId]` | **新建** | 单场比赛中心：scoreboard + 这场比赛的所有市场（match_winner 卡 / exact_score grid / 待开盘提示） | `GET /fixtures` filter + `GET /commercial-markets?fixtureId=` |
| `/markets/[marketId]` | **重写** | 单市场交易页：完整 order ticket、outcome selector、持仓、规则、odds deviation | `GET /markets/:id` + `GET /odds/markets/:id` + chain reads + `POST /risk/check` |
| `/portfolio` | **重写** | 我的全部持仓（按状态分组：可交易 / 待结算 / 可赎回 / 已结算 / 已退款），含未实现/已实现 PnL 估算 | `GET /portfolio/:wallet` + 链上余额聚合 |
| `/settlements` | **新建（替换 redirect）** | 待结算/挑战中/可赎回 feed；用户可查证据 URI、发起挑战（如开 `enablePublicChallenge`）、redeem | `GET /settlements` + `GET /markets/:id` per 行 |
| `/operator` | **保留不重设计** | 现有运营台原样保留；从主导航**移除**，仅 footer 一个 "Operator console" 链接，路由加 `?key=` 简易门禁（环境变量校验） | 现有 |
| `/live`、`/settlement` | **删除** | 不再保留旧 alias，由 `/` 和 `/settlements` 取代 | — |

### 3.2 全局导航

**桌面顶栏**（左→右）：

```
[polygoal logo]   Markets   Schedule   Portfolio   Settlements        [Wallet pill]
```

**移动底栏**：

```
[Markets]  [Schedule]  [Portfolio]  [Settlements]
```

钱包入口在移动端折叠进 Portfolio 顶部。`Operator` 不出现在任何主导航。

### 3.3 主用户旅程

```
Discovery               Selection           Trade                Settle / Redeem
─────────────────────   ─────────────────   ──────────────────   ─────────────────
/                  →    /markets/[id]   →   risk-check + buy →   /portfolio  →
/schedule              /matches/[id]       (chain tx)           /settlements →
                                                                redeem (chain tx)
```

每一步都是 1-click 跳转。任何页面右上角 Wallet pill **不消失**。

## 4. 页面设计

### 4.1 `/` 首页（Markets 列表）

**布局（桌面 ≥1024px）**：

```
┌────────────────────────────────────────────────────────────┐
│ Hero (轻量): "Predict the 2026 World Cup. 1:1 collateral." │
│ + 2 个 StatCard: Live markets / Settled volume (24h)       │
├────────────────────────────────────────────────────────────┤
│ [筛选条]  Status: All ▾ | Stage: All ▾ | Sort: Closing ▾   │
├────────────────────────────────────────────────────────────┤
│ 🔴 Live now (2)                                            │
│   ┌─ MarketCard ─┐ ┌─ MarketCard ─┐                        │
│   │ BRA 1-1 MAR  │ │ ARG 0-0 ESP  │                        │
│   │ 63'   Live   │ │ 12'   Live   │                        │
│   │ Brazil 38%   │ │ Argentina 51%│                        │
│   │ Draw    29%  │ │ Draw    27%  │                        │
│   │ Morocco 33%  │ │ Spain   22%  │                        │
│   │ Vol 12.4K    │ │ Vol  3.2K    │                        │
│   └──────────────┘ └──────────────┘                        │
├────────────────────────────────────────────────────────────┤
│ 📅 Opening soon (next 24h)                                 │
│   ... 同样的 MarketCard，但展示开赛倒计时             │
├────────────────────────────────────────────────────────────┤
│ ⏳ Settling (proposed → finalize)                          │
│   markets with oracleState in {proposed, challenged}       │
│   每行: ITA 2-1 FRA · Proposed: Italy · Challenge 04:52   │
└────────────────────────────────────────────────────────────┘
```

**关键决策**：
- 不再有"特色矩阵 + 单 demo 比赛"两套东西。统一为 **MarketCard** 列表。
- `MarketCard` 是唯一的市场卡片组件，整张卡片可点击 → `/markets/[id]`。
- 每场 fixture 只出**一张 match_winner 卡**；exact_score 入口在 fixture/market 页内。
- 排序选项：`Closing soon` / `Volume 24h` / `Newest`。默认 `Closing soon`。
- 数据加载状态用 skeleton；空状态用人话："No markets open right now. Next match: France vs Senegal in 2h 14m."

**数据**：
- SSR: `Promise.all([apiGet('/commercial-markets?marketType=match_winner'), apiGet('/fixtures')])`
- CSR poll: 每 15 秒重取（live 段每 5 秒）。用 SWR + `revalidateOnFocus`。

### 4.2 `/schedule` 赛程

**布局**：

```
┌────────────────────────────────────────────────────────────┐
│ Tab: Group stage ▮ | Knockout                              │
│ Filter: Date ▾ | Group ▾ | Team ▾                          │
├────────────────────────────────────────────────────────────┤
│ Thu Jun 11, 2026                                           │
│   ┌─ FixtureRow ─────────────────────────────────────────┐ │
│   │ 🇲🇽 MEX vs CMR 🇨🇲   18:00 MX  Estadio Azteca  Sched   │ │
│   │   Match winner →  · Exact score → (opens at kickoff) │ │
│   └──────────────────────────────────────────────────────┘ │
│   ...                                                      │
└────────────────────────────────────────────────────────────┘
```

**关键决策**：
- 数据来自 `GET /schedule`（72 场已有）。淘汰赛占位（"Winner Group A vs Runner-up Group B"）保留为不可点击行，挂 `disabled` 样式。
- 每行：fixture 基础信息 + 该 fixture 在 `/commercial-markets` 中已存在市场的快捷链接。
- 没有市场的 fixture 显示 "Opens at kickoff"。
- 移动端按日期分组的列表 + sticky 日期 header。

### 4.3 `/matches/[fixtureId]` 比赛中心

**布局**：

```
┌────────────────────────────────────────────────────────────┐
│ ← Back   BRA 1 - 1 MAR     63'  Live                       │
│                            Estadio Azteca · 28°C            │
│ Data: Sportradar updated 8s ago  ⚠ deviation 3.4%  (badge)│
├──────────────────────────┬─────────────────────────────────┤
│ Match Winner             │ Match events                    │
│ (full MarketCard) ──→ /markets/...                         │
│                          │ 23' ⚽ Vinicius (BRA)            │
│ Exact Score (10 outcomes)│ 58' 🟨 Saiss (MAR)              │
│ Grid: 0-0 | 1-0 | 0-1   │                                  │
│       1-1 | 2-0 | 0-2   │                                  │
│       2-1 | 1-2 | 2-2   │                                  │
│       Other score        │                                  │
│ (if exact_score exists)  │                                  │
└──────────────────────────┴─────────────────────────────────┘
```

**关键决策**：
- 这是 discovery 终点 + 交易跳板。**不在这里交易**，只把所有市场入口聚合。
- exact_score 网格：每格显示 outcome 标签 + provider odds（若 `providerOdds.status === "verified"`）或 `No odds yet`；点击跳 `/markets/[exact_score_market_id]?outcome=N`。
- 如果 fixture 没有 `match_winner` 市场（pre-kickoff 还未 bootstrap）：显示 "Markets open at kickoff · 2h 14m"。
- 比赛事件流来自 `match_events`（目前后端有 `/admin/sync/live-events` 写入但**没有读 API**，标记为 **API Gap #2**，先显示 EmptyState 而非伪造事件）。

### 4.4 `/markets/[marketId]` 市场详情（核心交易页）

**布局（桌面）**：

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Back   Brazil vs Morocco · Match Winner                        │
│ 1-1   63'  Live  ·  Closes in 27:00  ·  Vol $12.4K  ·  TVL $48K │
├─────────────────────────────────────┬────────────────────────────┤
│ Outcomes                            │ Trade ticket               │
│ ┌─ OutcomeCard (selected) ──────┐  │ Buy ▮  | Sell              │
│ │ Brazil     38%  →  $0.38      │  │                            │
│ │ Pays $1.00 if Brazil wins     │  │ Selected: Brazil           │
│ └────────────────────────────────┘  │ Amount: [   100   ] USDC   │
│ ┌─ OutcomeCard ──────────────────┐  │ You receive: 263.16 shares │
│ │ Draw       29%                 │  │ Avg price: $0.38           │
│ └────────────────────────────────┘  │ Max payout: $263.16        │
│ ┌─ OutcomeCard ──────────────────┐  │ Slippage: 0% (1:1 pool)    │
│ │ Morocco    33%                 │  │                            │
│ └────────────────────────────────┘  │ [ Connect wallet ]         │
│                                     │  ↳ [ Approve USDC ]        │
│ Provider odds (live):               │  ↳ [ Buy Brazil ]          │
│ • Pinnacle: 38 / 30 / 32 · 12s     │                            │
│ • Bet365 :  39 / 28 / 33 · 4s      │ Tx status badge here       │
│ Deviation: 3.4% ⚠ (above 3% gate)  │                            │
├─────────────────────────────────────┴────────────────────────────┤
│ Your position                                                    │
│   You hold 0 Brazil shares · 0 Draw · 0 Morocco                  │
│   (after trade, this section refreshes)                          │
├──────────────────────────────────────────────────────────────────┤
│ Settlement rules                                                 │
│ • 90 mins including stoppage, excluding ET/penalties             │
│ • Resolves from FIFA + Sportradar consensus                      │
│ • Challenge window: 10 min after proposed result                 │
├──────────────────────────────────────────────────────────────────┤
│ Other markets for this match                                     │
│   [Exact Score →]  [More coming soon]                            │
└──────────────────────────────────────────────────────────────────┘
```

**关键决策**：
- **OutcomeCard 是交易表单状态机的一部分**。点击一张 OutcomeCard 同时（a）选中 outcome（b）让 Trade ticket 跟随更新。
- Buy/Sell tab：Sell 仅在用户有该 outcome 持仓时启用。
- CTA 状态机（按顺序，自动推进）：
  1. `[Connect wallet]` → 触发 `connectInjectedWallet()`
  2. 钱包连上但链不对 → `[Switch to X Layer Testnet]`
  3. 链对了但 allowance 不够 → `[Approve USDC]`
  4. 都 OK → `[Buy Brazil]`（按钮显示当前选中 outcome 标签）
  5. 提交后 → `[Sending…]` → `[Confirming on-chain…]` → `[Success · View tx ↗]`
- 失败状态：把 `/risk/check` 返回的 `reason` 翻译为人话 —— `USER_LIMIT_EXCEEDED` → "You're at the per-user exposure limit ($5,000)."
- "Provider odds (live)" 区块的数据来自 `GET /odds/markets/:marketId` 的 `snapshots[]`；deviation badge 来自 `comparison.maxDeviationBps` + `.status`。**bps 永远转成 %** 展示。
- "Settlement rules" 文案来自 `resolutionPolicy`；如果是 hash 形式，前端做 enum 映射表（**API Gap #1**：需要后端返回 human-readable rule 文案）。
- "Other markets" 区块：调 `/commercial-markets?fixtureId=...` 列出其他类型。

### 4.5 `/portfolio` 持仓

**布局**：

```
┌──────────────────────────────────────────────────────────────────┐
│ Portfolio                                                        │
│ Wallet: 0xabcd…1234  [Disconnect]                                │
│ Mock USDC balance: $1,234.56  [Faucet] (testnet only)            │
├──────────────────────────────────────────────────────────────────┤
│ Summary                                                          │
│   Open positions: 4 · Locked: $420 · Redeemable: $215            │
│   24h PnL (realized): +$12.40                                    │
├──────────────────────────────────────────────────────────────────┤
│ Redeemable now (2)                                               │
│   ┌─ PositionRow ─────────────────────────────────────────────┐ │
│   │ ITA vs FRA · Italy won · You held 100 Italy shares        │ │
│   │ Payout: $100.00   [ Redeem ]                              │ │
│   └────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│ Live (2)                                                         │
│   PositionRow → 链接到 /markets/[id]                              │
├──────────────────────────────────────────────────────────────────┤
│ Waiting result (1)   |   Settled (5)   |   Refunded (0)          │
└──────────────────────────────────────────────────────────────────┘
```

**关键决策**：
- 顶部 KPI 必须来自实际数据。如果 `/portfolio/:wallet` 返回空（钱包没交易过），显示 empty state：`"No trades yet. Browse markets →"`。
- 顶部 StatCard **删掉静态 100 Brazil**。
- 按市场状态分组（5 组）：`Redeemable / Live / Waiting result / Settled / Refunded`。
- "Redeem" 按钮：调 `redeemOutcome(market.marketAddress, outcomeIndex, sharesAmount)`；按钮内联显示 tx 状态。
- "Redeem all" 顶部一键：批量遍历 redeemable 行（不是合约级 batch，前端串行发送）。
- Mock USDC balance 调 SDK `readUsdcBalance(...)`；faucet 按钮调 mint（仅 testnet，由 env 控制是否显示）。

### 4.6 `/settlements` 结算 feed

**布局**：

```
┌──────────────────────────────────────────────────────────────────┐
│ Settlements                                                      │
│ Filter: All ▾ | Proposed | Challenged | Redeemable | Settled    │
├──────────────────────────────────────────────────────────────────┤
│ ⏳ Proposed (3)                                                  │
│   ITA vs FRA · Proposed: Italy · Challenge ends in 04:52        │
│   Evidence: ipfs://… [↗]  [ Challenge ]                          │
├──────────────────────────────────────────────────────────────────┤
│ ⚖ Challenged (1)                                                │
│   Pending operator review                                        │
├──────────────────────────────────────────────────────────────────┤
│ ✓ Redeemable now (links into Portfolio)                          │
└──────────────────────────────────────────────────────────────────┘
```

**关键决策**：
- 数据：`GET /settlements?status=proposed|challenged|finalized`。
- Challenge 按钮仅在 `featureFlags.enablePublicChallenge === true` 时可用；否则按钮置灰，悬浮提示 "Public challenges disabled. Contact support."
- 不需要 redeem 按钮（在 Portfolio 行内）。这里是 feed，关注的是结果可见性和挑战入口。

### 4.7 `/operator` 保留入口（不重设计）

- 主导航**移除**链接，仅在 footer 出现一个 "Operator console" 文字链。
- 路由本身保留现有代码（避免本轮 PR 范围爆炸）。
- 在 `apps/web/middleware.ts` 加 `key` query 校验（与 `NEXT_PUBLIC_OPERATOR_KEY` 比对）。错配时 redirect `/`。
- 这只是一个"门"，**不是认证系统**，文档明确标注为 stop-gap。

## 5. 组件目录（重组）

```
apps/web/components/
├── markets/
│   ├── MarketCard.tsx              # 单一卡片组件（首页/比赛页/搜索结果都用它）
│   ├── OutcomeCard.tsx             # 单个 outcome 显示 + 点击选中
│   ├── ExactScoreGrid.tsx          # 比分网格（10 outcomes）
│   ├── TradeTicket.tsx             # 重写的交易表单（含 outcome selector + CTA state machine）
│   ├── ProviderOddsList.tsx        # 多源盘口列表 + deviation badge
│   ├── SettlementRules.tsx         # 人话规则展示
│   └── RelatedMarkets.tsx          # "Other markets for this match"
├── matches/
│   ├── FixtureHero.tsx             # /matches 顶部 scoreboard
│   ├── FixtureRow.tsx              # /schedule 一行
│   └── MatchEventsList.tsx         # 比赛事件流（API Gap #2 fallback to empty state）
├── portfolio/
│   ├── PortfolioSummary.tsx        # KPI 区
│   ├── PositionGroup.tsx           # 按状态分组容器
│   ├── PositionRow.tsx             # 单条持仓 + Redeem 按钮
│   └── BalanceFaucet.tsx           # Mock USDC 余额 + faucet（testnet only）
├── settlements/
│   ├── SettlementGroup.tsx
│   ├── SettlementRow.tsx
│   └── ChallengeDialog.tsx
├── wallet/
│   ├── WalletProvider.tsx          # 新增：React Context，全应用共享单一钱包状态
│   ├── WalletPill.tsx              # 顶部小药丸（替换 WalletStatus）
│   ├── ConnectButton.tsx           # 主 CTA 钱包按钮（复用在交易/赎回/挑战）
│   ├── useWallet.ts                # 唯一 hook
│   └── useInjectedWallet.ts        # 现有实现内化为 WalletProvider 的底层，外部禁用
├── ui/
│   ├── BrandMark.tsx               # 保留，去掉 Clean Stadium
│   ├── PageHero.tsx                # 保留，eyebrow 默认空
│   ├── StatCard.tsx                # 保留
│   ├── SiteNavigation.tsx          # 4 项导航
│   ├── DataFreshnessBadge.tsx      # 重命名自 DataQualityBadge，措辞改为 "Sportradar · 8s ago"
│   ├── DeviationBadge.tsx          # 重命名自 OddsDeviationBadge，bps→%
│   ├── TxStatusBadge.tsx           # 现有 TransactionStateBadge 接到真实流程
│   ├── EmptyState.tsx              # 新增：列表/分组空状态统一组件
│   ├── Skeleton.tsx                # 新增：加载占位
│   └── CountdownTimer.tsx          # 新增：close in / kickoff in
└── live/                           # 删除（LiveMatchCard 未使用）
└── settlement/                     # 旧 SettlementPanel 删除，新版在 settlements/ + portfolio/
└── operator/                       # 保留不动
```

**要删除/迁移的旧组件**：
- `LiveMatchCard`（未使用）
- `LiveWindowCard`（goal window 概念已移除）
- `MarketMatrixPanel`（被 MarketCard 列表替代）
- `MarketDetail`、`WalletTradePanels`、`TradeForm`、`SellPanel` → 全部并入新的 `TradeTicket` + `OutcomeCard` + `ProviderOddsList`
- `SettlementPanel` → 拆分为 `settlements/SettlementRow.tsx` + `portfolio/PositionRow.tsx` 的 redeem 部分
- `PortfolioDashboard` → 拆为 `PortfolioSummary` + `PositionGroup` + `PositionRow`

## 6. 状态机

### 6.1 钱包状态

```
disconnected ──connect()──→ connecting ──onAccount──→ connected
                              │
                              └─error──→ disconnected
connected ──onChainChange──→ wrong-network ──switchToAppChain()──→ connected
connected ──onAccountChange──→ connected (newAddress)
connected ──disconnect()──→ disconnected
```

`WalletProvider` 用 React Context 单例持有该状态机；`useWallet()` 是唯一访问入口。

### 6.2 交易 CTA 状态（per ticket）

```
idle
  → (wallet.disconnected)         show "Connect wallet"
  → (wallet.wrongChain)           show "Switch network"
  → (amount > 0 && !allowanceOk)  show "Approve USDC"
  → (amount > 0 && allowanceOk)   show "Buy <Outcome>"

riskChecking → (allowed) approving → (txHash) buying → (txHash) success / error
```

`/risk/check` 在每次 amount 变化（debounce 400ms）后调一次；按钮在 `decision.allowed === false` 时禁用并显示原因文案。

### 6.3 市场/Oracle 状态映射

UI 唯一关心 4 个市场可见状态：

| 后端 `status` | 后端 `oracleState` | UI 标签 | 用户可做 |
|---|---|---|---|
| `live_trading` / `closing_soon` | `none` | **Live** | 买 / 卖 |
| `closed` | `none` | **Awaiting result** | 只看 / 已锁仓 |
| `closed` / `proposed` | `proposed` | **Settling** + 挑战倒计时 | 挑战（如 `enablePublicChallenge`） |
| `closed` / `challenged` | `challenged` | **Disputed** | 等待裁决 |
| `redeemable` / `settled` | `finalized` | **Settled** | Redeem |
| `voided` | `voided` | **Voided** | Refund（**API Gap #4**：SDK 缺 `refund`） |

## 7. 数据流与缓存

| 数据 | 抓取层 | 频率 | 库 |
|---|---|---|---|
| `/commercial-markets`, `/schedule` (首页/赛程列表) | SSR + SWR | revalidate 30s | SWR / @tanstack/query |
| `/markets/:id`, `/odds/markets/:id` (详情页) | SSR shell + CSR poll | 5s live / 30s otherwise | SWR |
| `/risk/check` | CSR on input | debounce 400ms | fetch direct |
| `/portfolio/:wallet` | CSR on wallet connect | 10s when on /portfolio | SWR |
| `/settlements` | CSR | 15s | SWR |
| 链上余额 / allowance / position | CSR via viem | 在钱包/网络变化时刷新；交易后立刻 refetch | viem `publicClient` |

**SSR fallback**：所有 SSR 调用必须有 try/catch；失败时返回 `null` 让客户端 SWR 接管，而不是 fallback 到 demo db。**禁止 server-side 写 `createDemoDbWithMarket()`**。

## 8. 品牌与视觉

### 8.1 品牌

- 名称统一 **polygoal**（小写）。`Clean Stadium`、`On air`、`Standby` 全部移除。
- Logo：`/brand/logo-mark-green.png`（主）+ `/brand/logo-mark-white.png`（深色背景）。
- Wordmark：`polygoal · prediction markets`（小字辅助），所有页面 `<title>` = `polygoal · <PageName>`。

### 8.2 设计 tokens（保留并清理）

继承 `apps/web/app/globals.css` 现有 token：
- 品牌色 `#05b34f`
- 留：Inter font、stadium-net hero（仅首页 hero）、绿色 accent
- 删：`.broadcast-card`、`.mobile-tabbar` 中 `On air` 措辞、TV 比喻
- 新增：`--state-live`（红 #d93b3b）、`--state-settling`（琥珀 #f1a23a）、`--state-settled`（中灰）

### 8.3 暗色主题

本轮**不做暗色主题切换**（YAGNI）。需求文档提"暗色优先"是商业 V2 范围。本次以现有亮色优化收敛。

### 8.4 可访问性

- 所有 outcome 概率同时输出 `aria-label` 含百分比文字
- 倒计时用 `<time>` + `aria-live="polite"`
- Buy CTA 按钮一定有可达 keyboard focus
- 颜色对比度满足 WCAG AA（特别是 Live red on white）

## 9. API / 合约契约

### 9.1 现有 API 用法清单

| API | 用在 | 用法 |
|---|---|---|
| `GET /commercial-markets?marketType=match_winner` | `/`, `/matches/[id]` | 主市场列表 |
| `GET /commercial-markets?fixtureId=X` | `/matches/[id]`, `/markets/[id]`（Related） | 同场其他市场 |
| `GET /schedule` | `/schedule` | 全部 fixtures |
| `GET /fixtures?status=live` | `/`（Live now 区） | 状态过滤 |
| `GET /markets/:id` | `/markets/[id]` | 单市场含 odds comparison |
| `GET /odds/markets/:id` | `/markets/[id]` ProviderOddsList | 多源盘口 |
| `POST /risk/check` | TradeTicket | 提交前 gate |
| `GET /portfolio/:wallet` | `/portfolio` | 持仓 |
| `GET /settlements` | `/settlements`, `/portfolio` redeem 分组 | 结算 feed |
| `GET /admin/feature-flags` | TradeTicket（fees）、Settlements（challenges） | UI 开关 |

### 9.2 需要后端补的接口契约（API Gaps）

| # | 缺什么 | 影响页面 | 临时方案 | 建议后端补 |
|---|---|---|---|---|
| 1 | `resolutionPolicy` 缺人话文案 | `/markets/[id]` Settlement rules | 前端写 enum 映射表 | `resolutionPolicy: { code, humanText, fullRulesUrl }` |
| 2 | `match_events` 没有 read API | `/matches/[id]` 事件流 | 显示 EmptyState | `GET /fixtures/:id/events` |
| 3 | `match_winner` 卡片缺 24h volume / 持仓数 | `/` MarketCard | 显示 — | `GET /commercial-markets` 返回 `stats: { volume24h, openInterest, traderCount }` |
| 4 | SDK 缺 `refund` wrapper | `/portfolio` voided 行 | 直接 viem encodeFunctionData | `@polygoal/sdk` 加 `refundOutcome` |
| 5 | exact_score 缺真实 provider 赔率 | `/matches/[id]` 网格 | 仅显示 outcome 标签 + "No odds yet" | 上 odds provider，写入 `CommercialMarketOutcome.providerOdds` |
| 6 | 钱包余额/持仓没有 indexer 推送 | 全站 | 交易后客户端轮询 5 次 | WebSocket 或 SSE（V2） |
| 7 | `/portfolio/:wallet` 不返回当前价值/盈亏 | `/portfolio` PnL | 客户端用 1:1 估算 max payout | 服务端聚合 PnL（V2） |
| 8 | `/commercial-markets` 不能按 `displayPriority` 排序 | `/` 排序 | 前端 sort | API 支持 `?sort=closingSoon` 等 |
| 9 | 没有 `marketCategory` 过滤 | `/` 类型 filter | 前端用 `marketType` filter | 兜底已 OK |
| 10 | featureFlags 没有 hash 化 RBAC | `/operator` 门禁 | env 校验 `key` query | 真实 auth（V2） |

**所有 API gap 在前端用清晰的 fallback / EmptyState 标记，不允许伪造数据。**

### 9.3 合约调用一览

| 操作 | 合约函数 | SDK helper | 何时调 |
|---|---|---|---|
| 读 USDC 余额 | `MockUSDC.balanceOf` | `readUsdcBalance` | 钱包连接后 / 交易后 |
| 读 allowance | `MockUSDC.allowance` | `readAllowance` | 输入金额变化后 |
| 授权 USDC | `MockUSDC.approve` | `approveUsdc` | allowance < amount |
| 买 | `WorldCupMarket.buy` | `buyOutcome` | 风控通过 + 授权够 |
| 卖 | `WorldCupMarket.sell` | `sellOutcome` | 用户有持仓 |
| 读持仓 | `ConditionalTokensLite.balanceOf` via `readPositionBalance` | `readPositionBalance` | /markets 详情、/portfolio |
| 赎回 | `WorldCupMarket.redeem` | `redeemOutcome` | 状态 `Redeemable` |
| 退款 | `WorldCupMarket.refund` | **缺**（Gap #4） | 状态 `Voided` |

## 10. 验收标准

### 10.1 通用

- [ ] 所有页面在 ≤375px 宽度可单手操作（无横向滚动、CTA 可触达）
- [ ] 所有页面 SSR 不依赖 `createDemoDbWith*()`；构建产物里**不含** `"Clean Stadium"` / `"On air"` / `"market-demo-"` 字面量
- [ ] 任何概率显示用 `%`，不用 `bps`
- [ ] 任何金额显示带货币单位（USDC）
- [ ] 全站只有一个 `useWallet()` 数据源

### 10.2 首页 `/`

- [ ] 没有任何写死的比赛对阵
- [ ] 至少能正确渲染 0 / 1 / 多个 live markets 三种情况
- [ ] 卡片整体可点击，点击行为唯一进入 `/markets/[id]`
- [ ] 排序切换不触发整页 SSR，是 client-side 重排
- [ ] Closing soon 倒计时秒级更新

### 10.3 比赛页 `/matches/[fixtureId]`

- [ ] 显示真实 fixture 数据
- [ ] 若该 fixture 没有 match_winner 市场，CTA 显示 kickoff 倒计时
- [ ] exact_score 网格在 `providerOdds.status !== "verified"` 时**不展示赔率**，只显示 outcome 标签

### 10.4 市场详情 `/markets/[marketId]`

- [ ] 用户能用 OutcomeCard 选不同 outcome；选谁，链上 tx 就发谁
- [ ] CTA 状态机按 wallet→chain→approval→risk→buy 顺序自动推进
- [ ] `/risk/check` 失败时显示人话原因
- [ ] tx 失败/成功 banner 中带 explorer 链接
- [ ] Provider odds 至少展示 2 个源 + deviation %

### 10.5 持仓 `/portfolio`

- [ ] 顶部 KPI 来自 API/链上聚合，不能 hardcode
- [ ] 空钱包显示 EmptyState + 引导到 `/`
- [ ] Redeemable 行的 Redeem 按钮调真实合约
- [ ] Mock USDC faucet 仅在 `NEXT_PUBLIC_SHOW_FAUCET=true` 显示

### 10.6 结算 `/settlements`

- [ ] 至少分 4 个 status 段：Proposed / Challenged / Redeemable / Settled
- [ ] Challenge 按钮根据 `enablePublicChallenge` 开关启用/禁用
- [ ] Evidence URI 链接安全打开（`target="_blank" rel="noopener"`）

### 10.7 兼容性

- [ ] 现有 `apps/web/test/*.test.tsx` 全部通过或更新
- [ ] `responsive-smoke.ts` 移除已删的 redirect 路由（`/live`, `/settlement`）
- [ ] `/operator` 路由可访问（带正确 `?key=`），UI 未改动

## 11. 实施分期

> 本文档仅是设计 spec。实际拆 PR 在写 implementation plan 时进行。这里给出粗粒度顺序，**不要在本设计 PR 中实现代码**。

| 阶段 | 内容 | 估算 |
|---|---|---|
| P1 基础设施 | WalletProvider Context、TxStatusBadge 接真实状态、DataFreshnessBadge/DeviationBadge 改名 & 去黑话、SiteNavigation 4 项 | 1 PR |
| P2 首页 | `/`：MarketCard + SWR + filter/sort + skeleton + empty state | 1 PR |
| P3 赛程 | `/schedule`：FixtureRow + 日期分组 + tab Group/Knockout | 1 PR |
| P4 比赛页 | `/matches/[fixtureId]`：FixtureHero + 市场聚合 + exact-score grid + events placeholder | 1 PR |
| P5 市场详情 + 交易 | `/markets/[id]`：OutcomeCard + TradeTicket（CTA 状态机）+ ProviderOddsList + Related | 1-2 PR |
| P6 持仓 | `/portfolio`：PortfolioSummary + PositionGroup + Redeem flow + Faucet | 1 PR |
| P7 结算 | `/settlements`：SettlementGroup + ChallengeDialog | 1 PR |
| P8 清理 | 删除 LiveMatchCard / LiveWindowCard / SellPanel / 旧 SettlementPanel；redirect 路由移除；operator 加 key 门禁 | 1 PR |
| P9 后端 gap 跟进（与后端协作） | 阻塞性：#1 resolution rule 文案、#2 match events 读 API、#5 exact-score 真实赔率、#4 SDK refund；优化型：#3 卡片 stats、#7 PnL、#8 sort、#6 推送、#10 RBAC | 跨团队 |

## 12. 非目标

明确**不在本轮范围**，避免 scope 蔓延：

- 暗色主题（V2）
- 串关 / 让球 / 大小球 / 球员 / 卡牌 / 角球市场
- KYC、地域限制 UI
- LP 仪表盘 / 流动性提供
- WebSocket / SSE 实时推送
- 历史 K 线 / 价格曲线
- 多语言（i18n）
- 运营台重设计
- 合约升级（Refund SDK helper 由后端 SDK 团队补）

## 13. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| `exact_score` 缺真实 provider 赔率 | 比分网格只有标签没赔率，体验弱 | 设计层面坦诚显示 "No odds yet"；后端 V2 接入 odds 后无需前端改动 |
| Mock USDC vs USDT 文案历史污染 | 用户认知混淆 | 统一显示 `USDC`（合约即 MockUSDC）；faucet 按钮注明 "Testnet only · No real value" |
| chain id 漂移（Anvil 31337 vs X Layer testnet 1952） | wrong-network 误触发 | `useWallet()` 内严格用 `APP_CHAIN.id`；wrong-network 引导显式 switch |
| 后端 47 路由但 OpenAPI 只 33 个 | 文档脱节 | 前端 SDK 自己列出实际使用的路由清单（本文 §9.1） |
| 没有 indexer push，交易后 portfolio 延迟 | 用户觉得"没成功" | 交易后 5 秒内连续轮询 5 次 + 立刻 optimistic update |
| `/operator` 被搜索引擎抓 | 暴露 | `robots.txt` 加 `Disallow: /operator`，加 `noindex` meta |

## 附录 A · 后端能力速查

详见 `apps/api/src/routes/*` 和 `apps/api/src/openapi/spec.ts`。

**消费者实际会用到的路由（11 个）**：

```
GET  /commercial-markets         主市场列表（必用）
GET  /schedule                   赛程
GET  /fixtures                   状态筛选
GET  /markets/:marketId          市场详情
GET  /odds/markets/:marketId     多源盘口
GET  /odds/fixtures/:fixtureId   fixture 级聚合（备用）
GET  /portfolio/:walletAddress   持仓
GET  /settlements                结算 feed
GET  /admin/feature-flags        UI 开关读
POST /risk/check                 交易前 gate
GET  /health                     健康（可选）
```

其余 36 个均为 admin / 数据质量 / 同步路由，本轮消费者面不消费。

## 附录 B · 合约能力速查

`WorldCupMarket`：

```solidity
function buy(uint8 outcomeIndex, uint256 collateralAmount, uint256 minSharesOut) external;
function sell(uint8 outcomeIndex, uint256 sharesAmount, uint256 minCollateralOut) external;
function redeem(uint8 outcomeIndex, uint256 sharesAmount) external;
function refund(uint8 outcomeIndex, uint256 sharesAmount) external;  // SDK 未封装
```

定价：1:1（`sharesOutRaw == collateralAmountRaw`，slippage 永远 0）。

状态：`LiveTrading → Closed → ResultProposed → Challenged → Redeemable → Voided`。

`OptimisticResultOracle`：`proposeResult / challenge / finalize / adminResolve / voidMarket`。

**前端只调 `WorldCupMarket.{buy,sell,redeem,refund}` 和 `MockUSDC.{approve,balanceOf,allowance}`。**

---

## 决策对齐记录

| 决策 | 选择 | 时间 |
|---|---|---|
| 重设计范围 | A. Consumer only | 2026-05-19 |
| 导航 IA | B. Market-first | 2026-05-19 |
| API gap 处理 | B. 标注 gap + 补充 API 契约 | 2026-05-19 |
| 品牌 | A. 统一 polygoal | 2026-05-19 |
| 组件库 | HeroUI v3 (`@heroui/react`) + Tailwind v4 + framer-motion | 2026-05-19 |

## 实现增量记录（与原计划的偏差）

为减少持续维护成本与对齐 PM 风格的视觉语言，落地阶段做了以下调整，不再回头改本文档主体：

1. **首页改为「赛程优先」而不是「市场列表优先」**。`/` 由 `FixtureRow` 按日期分组展示比赛，每行显示该比赛是否同时有 `match_winner` / `exact_score` 入口，而不是按市场维度纯卡片化。原本计划独立的 `MarketCard.tsx` 组件已删除，避免和 `FixtureRow` 重复维护。
2. **统一组件库切换为 HeroUI v3**。所有 "卡片型" 容器（赛事行、持仓行、结算行、运营 console panel、Empty state、StatCard、Balance faucet…）使用 `<Card>`；状态徽标使用 `<Chip>`。色板对齐通过覆盖 `--accent / --success / --warning / --danger / --focus / --radius` 等 root token，无需 per-component 配置。
3. **保留自定义 `.button` 与 `.skeleton`**。HeroUI 同名 class 会与既有的品牌按钮/骨架动画冲突；落地阶段决定保留自定义实现，等 HeroUI 升级到提供命名空间的版本再迁移。
4. **Tailwind 版本固定为 v4**。HeroUI 内部使用 `@apply`，必须经过 `@tailwindcss/postcss`；如果未来切换到纯 CSS 方案需要同步删除 `postcss.config.mjs` + `apps/web/heroui.d.ts`。
5. **细节卡片结构沿用 `Card.Header / Card.Content / Card.Footer` 三段**，使行级 UI（持仓、结算）有一致的语义边界，移动端响应式只需要在 `<Card.Content>` 内做布局，不会影响外框 spacing。
6. **`SettlementRow` 的 "Evidence pending" 文案**已从 `Evidence URL is a placeholder in demo data` 改为 `Evidence URL not provided yet`，避免触发 `apps/web/test/ui-components.test.tsx` 中的 dev-only wording guard。

