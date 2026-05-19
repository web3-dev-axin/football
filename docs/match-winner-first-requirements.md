# Match Winner First Product Requirements

## 背景

当前产品首页和 Live Market Matrix 把 `5-minute goal window`、`10-minute goal window`、`15-minute goal window` 放在用户第一层视野里。截图中的核心信息是多张时间窗口卡片，用户需要先理解“从 63:00 到 68:00 是否进球”这类规则，才能判断自己要买什么。

从普通球迷视角看，这不是最自然的决策方式。用户进入世界杯预测市场时，第一反应通常是：

- 这场比赛谁赢？
- 有没有平局？
- 最终比分可能是多少？

时间窗口不是普通球迷想要的核心玩法。新的产品方向需要把市场发现路径改成“比赛结果优先”，只保留用户容易理解的胜负平和比分预测。

## 产品目标

把普通用户的默认交易体验从“选择时间窗口”改成“预测比赛结果”。

核心目标：

- 首页、Live 页面、市场详情页优先展示胜负平市场。
- 比分预测保留为次级玩法，但不抢占主入口。
- 时间窗口玩法从本轮产品需求中移除，不作为普通用户市场、主导航、次级入口或高级玩法展示。
- 每个市场卡片必须让用户在 3 秒内理解“我买的是哪个结果”。
- 文案从技术规则驱动改为足球结果驱动。

## 用户需求

### 普通用户

普通用户不应该先学习 goal window。用户需要先看到比赛双方、当前比分、比赛状态和可买结果。

用户故事：

- 作为用户，我想直接选择 Brazil 胜、Morocco 胜或平局，而不是先理解 5/10/15 分钟窗口。
- 作为用户，我想看到常见比分选项，例如 1-0、1-1、2-1，作为比分预测入口。
- 作为用户，我想知道我买入后，如果该结果命中可以获得多少 payout。
- 作为用户，我不需要理解任何时间窗口规则，也能完成核心市场交易。

### 运营用户

运营用户需要管理赛果、比分、数据源和结算参数。时间窗口不进入本轮运营配置范围。

运营需求：

- 可以配置主推市场类型：胜负平、比分。
- 默认主推市场必须是胜负平。
- 比分市场作为次级市场展示。
- 不创建、不展示、不运营时间窗口市场。

## 信息架构修改

### 首页

当前首页展示 `Tradeable goal window`，需要改成比赛结果导向。

首页首屏应展示：

- 比赛双方：Brazil vs Morocco。
- 当前比分和比赛时间。
- 主推问题：`Who will win?`
- 三个主 outcome：Brazil、Draw、Morocco。
- 次级入口：`Predict exact score`。

首页不再首屏展示：

- `Tradeable goal window`
- `Goal must happen inside this match-time range`
- `5-minute / 10-minute / 15-minute goal window`

### Live Markets 页面

Live Markets 的默认列表应按比赛聚合，而不是按时间窗口聚合。

每场比赛卡片应包含：

- 比赛双方、比分、比赛状态。
- 胜负平市场状态和主要价格。
- 比分预测入口。

默认排序：

1. 正在直播的比赛。
2. 有可交易胜负平市场的比赛。
3. 即将开赛的比赛。
4. 已结束但可结算或可赎回的比赛。

### 市场详情页

市场详情页默认展示胜负平交易面板。

主要区域：

- 标题：`Brazil vs Morocco - Match Winner`
- 问题：`Who will win this match?`
- Outcome：`Brazil`、`Draw`、`Morocco`
- 当前比分、比赛时间、数据质量、交易状态。
- 买入/卖出面板。

次级区域：

- `Exact Score` 比分预测模块。
- 推荐展示 6-10 个常见比分选项。
- 允许用户查看更多比分选项。

## 市场类型优先级

### P0: 胜负平市场

胜负平是默认主推市场。

市场问题：

`Who will win Brazil vs Morocco?`

Outcomes：

- `Brazil`
- `Draw`
- `Morocco`

结算口径：

- 以全场常规时间结果为准，是否包含加时和点球必须在市场规则中明确。
- MVP 建议先使用 `90 minutes including stoppage time, excluding extra time and penalties`。

### P1: 比分预测市场

比分预测保留，但作为次级玩法。比分市场必须接入真实盘口数据，不能只用前端静态选项或 demo 概率展示。

市场问题：

`What will the final score be?`

推荐 outcome：

- `0-0`
- `1-0`
- `0-1`
- `1-1`
- `2-0`
- `0-2`
- `2-1`
- `1-2`
- `2-2`
- `Other score`

结算口径：

- 与胜负平保持同一比赛范围。
- 如果比分不在列出的常见选项内，结算为 `Other score`。

盘口数据要求：

- 从专业 odds provider 拉取 exact score / correct score 盘口。
- 每个比分 outcome 需要展示 provider odds、隐含概率、更新时间和数据来源。
- 至少保留 provider 原始比分标签和归一化后的 outcome label，避免 `1-0`、`Home 1 Away 0` 等格式不一致导致映射错误。
- 如果 provider 不提供某个常见比分盘口，前端应标记为 `No provider odds`，不能伪造真实盘口。
- `Other score` 需要明确是否来自 provider 的 `Any Other Score` 盘口；如果 provider 没有对应盘口，MVP 不应展示真实赔率。
- 比分盘口需要参与数据质量校验，包括 stale odds、fixture mismatch、provider timestamp、odds deviation 和 outcome mapping error。

## 文案修改要求

需要替换的主文案方向：

- `Live Market Matrix` 改为 `Match Markets` 或 `Featured Match Markets`。
- `Commercial market matrix` 改为 `Featured markets`。
- `Tradeable goal window` 改为 `Featured market` 或 `Match winner`。
- `Goal scored from 63:00 to 73:00` 不应作为主标题。
- `Goal windows are binary and chain-ready` 不应出现在普通用户页面。

推荐文案：

- `Pick the match result first.`
- `Start with who wins. Exact score is available when you want a more specific prediction.`
- `Score markets use real provider odds when available and clearly show data freshness.`

## 数据和 API 需求

需要新增或调整市场类型：

- `match_winner`
- `exact_score`

市场定义需要支持：

- `displayPriority`
- `isFeatured`
- `marketCategory`
- `outcomeLabels`
- `settlementRule`

建议分类：

- `core`: 胜负平。
- `score`: 比分。

API 返回市场列表时，应支持按 `marketCategory` 和 `displayPriority` 排序。前端不应依赖字符串匹配来决定展示优先级。

真实盘口数据要求：

- `match_winner` 必须拉取 moneyline / 1X2 盘口。
- `exact_score` 必须拉取 exact score / correct score 盘口。
- API 需要返回每个 outcome 的 provider odds、normalized probability、source、lastUpdatedAt、providerMarketId 和 providerOutcomeId。
- API 需要区分平台内部交易价格和外部 provider 盘口，前端文案不能把 provider odds 当成链上成交价格。
- 当比分盘口数据缺失、过期或映射失败时，比分市场仍可作为预测入口展示，但必须降低可信度标识，并禁用“真实盘口”标签。

## 前端验收标准

- 首页首屏可以看到胜负平市场，不再出现 goal window 作为主 KPI。
- Live 页面默认按比赛展示，每场比赛优先展示胜负平。
- 市场详情页默认问题是“谁赢”，不是“某时间段是否进球”。
- 比分预测入口存在，但视觉层级低于胜负平。
- 比分预测必须展示真实 provider 盘口数据或明确显示数据缺失状态，不能只展示静态 demo odds。
- 产品页面不展示时间窗口市场、时间窗口入口或时间窗口交易说明。
- 用户无需理解 5/10/15 分钟窗口，也能完成一次主市场交易。
- 移动端首屏必须先出现比赛、比分、胜负平 outcome。

## 非目标

本需求要求从产品体验、页面入口、市场配置和用户文案中移除时间窗口玩法。历史代码中的时间窗口合约、结算服务或测试路径只作为迁移清理对象存在，不应继续驱动任何用户可见功能。

本需求不覆盖：

- 串关。
- 让球。
- 大小球。
- 球员进球。
- 角球、黄牌等事件市场。
- 真实资金合规流程。

## 实施建议

建议分三步实施：

1. 先修改产品文案、页面排序和 demo 数据，让用户视角切换到胜负平和比分预测。
2. 再补充 `match_winner` 和 `exact_score` 市场类型、测试和 API schema。
3. 最后从用户页面移除 goal window 相关卡片、入口和说明，只在历史测试或内部迁移说明中保留必要引用。

## 风险

- 当前链上合约和测试路径可能主要围绕二元 goal window。如果胜负平或比分需要多 outcome 支持，需要确认合约和交易面板是否已经支持。
- 比分市场 outcome 数量多，流动性会被拆散。MVP 需要限制常见比分数量，并使用 `Other score` 收口。
- 胜负平结算必须明确是否包含加时和点球，否则世界杯淘汰赛会出现争议。
