# Data Sources

数据源驱动两件事：

1. **赛事数据 / fixture / live event** → 决定能否创建市场、能否 propose result（结算依据）。
2. **盘口 / odds** → 决定前端展示的外部参考概率、初始流动性参数和风控偏离告警（不作为结算依据）。

商业版本必须分层接入，并保留多源对比 + 链上证据。

## 1. 本地 / Demo 数据源

local 环境用确定性 demo snapshot，避免依赖外部凭证：

- `fifa_official`：canonical fixture / team 参考快照。
- `sports_data_provider`：provider mirror，用于 mismatch 检测。
- `fifa_reference`：odds 参考快照，给 demo odds ingestion 用。
- `provider_a`：demo odds provider 快照（包含 1X2 和 correct score 两种 odds_type）。

入口脚本：

```bash
bun apps/api/scripts/import-official-snapshot.ts --fixture demo-2026-001
bun apps/api/scripts/import-provider-odds.ts --fixture demo-2026-001
```

`POST /admin/data-quality/fixtures/inject-mismatch` 可故意构造冲突，验证阻断逻辑。

## 2. 商业 Provider 边界

生产 sports + odds provider 必须通过 provider adapter 接入。所有 raw payload 必须保存：

- source / provider name
- provider 内部 id（fixture / market / outcome）
- source timestamp（provider 时钟）
- ingestion timestamp（系统时钟）
- payload hash（结算证据）
- raw payload（JSON）
- normalized fields（fixture / event / odds）

Provider 数据不能直接成为 canonical，必须通过 comparison job 标 `verified` 才可使用。

阻断规则：

- Critical fixture / live event mismatch → 阻断 market creation 或 result proposal。
- Critical odds mismatch → 触发市场 pause 或 review-required。
- Provider 延迟 / outage / 离群 → 自动 pause 当前依赖该 provider 的市场。

## 3. 按市场类型的盘口要求

### 3.1 `match_winner`

- 必须拉取 **1X2 / moneyline** 盘口（Home / Draw / Away）。
- 每个 outcome 必须返回：`provider`、`bookmaker`、`decimal_odds`、`american_odds`、`implied_probability_bps`、`provider_market_id`、`provider_outcome_id`、`provider_updated_at`、`payload_hash`。
- 至少两个 provider 数据齐备时才能驱动初始流动性 / probability。
- provider 数据与链上市场偏离超过 `ODDS_WARNING_DEVIATION_BPS` → DeviationBadge warning；超过 `ODDS_CRITICAL_DEVIATION_BPS` → critical + 触发风控告警。

### 3.2 `exact_score`

- 必须拉取 **correct score / exact score** 盘口。
- 内部 outcome label（`0-0` / `1-0` / ... / `Other score`）必须与 provider 原始 label 建立映射；不一致时记录 mapping mismatch，前端展示 `No provider odds`。
- `Other score` 是否对应 provider 的 `Any Other Score` 必须显式声明；如果 provider 没有对应盘口，MVP 不应展示真实赔率，但市场仍可保留。
- 比分盘口必须参与数据质量校验，包括 stale odds、fixture mismatch、provider timestamp、deviation 和 outcome mapping error。

### 3.3 旧 goal-window（保留，不展示）

- `goal_window_*` 仍需要 `live` 比分 + goal event provider。
- `next_goal_team` 等多 outcome 滚球市场进入 V3 路线后再接入对应盘口。

## 4. Sync 频率（生产建议）

| 任务 | 频率 |
| --- | --- |
| sync-teams | 赛前每日 1 次；抽签后手动 |
| sync-fixtures | 赛前每日 1 次；比赛日每 1-5 分钟 |
| sync-live-events | live match 每 15-30s（用于事件统计 / Legacy goal-window，与 match_winner 结算无直接关系） |
| sync-odds（赛前） | 每 1-5 分钟 |
| sync-odds（live） | 每 5-15s |
| compare-odds | 每次 snapshot ingest 后触发，或每 10-30s 批量 |
| propose-results | 比赛结束后队列驱动 |
| finalize-results | 每 1-5 分钟扫描 challenge 到期 proposal |

## 5. 数据标准化原则

- 所有外部 ID 保留原始字段，同时生成内部 UUID（fixture id 用 `fifa_match_id`）。
- 所有时间统一保存 UTC，同时保留 local display 字段。
- raw JSON 留底用于审计与争议处理。
- 任何用于结算的数据必须有 payload hash + evidence URI。
- 不能用页面展示字段直接驱动链上结算。
- 盘口 payload 必须保留 `provider_timestamp / ingested_at / bookmaker / payload_hash`；外部盘口仅用于展示、初始化、风控、人工复核，不能替代规则结算。
- `match_winner` 与 `exact_score` 共享一份 fixture data 快照；任意一份 mismatch 都同时影响两类市场的创建 / 结算。

## 6. 当前仓库限制

- 提供 demo provider adapter、对比逻辑和 schema hook。
- 真实 provider 凭证、license 特定 payload mapping、托管 SLO 监控必须由 staging / production 提供。
- X Layer Testnet 演示市场（`deployments/xlayer-testnet.json`）目前使用 demo odds；接入真实 1X2 / correct score 之前不开放 production。

## 7. 调试 / 验证

```bash
# 查看保存的 snapshot
psql "$DATABASE_URL" -c "select source, payload_hash from data_source_snapshots;"

# 查看对比状态
psql "$DATABASE_URL" -c "select subject_type, subject_key, status from data_comparisons;"

# 触发对比
curl -X POST http://localhost:8787/admin/data-quality/fixtures/compare \
  -H "content-type: application/json" \
  -d '{"fixtureId":"demo-2026-001"}'

# 触发 inject mismatch（demo only）
curl -X POST http://localhost:8787/admin/data-quality/fixtures/inject-mismatch \
  -H "content-type: application/json" \
  -d '{"fixtureId":"demo-2026-001","field":"kickoffAtUtc","providerValue":"2026-06-13T22:00:00.000Z"}'
```
