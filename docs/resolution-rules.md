# Resolution Rules

`resolution_policy_hash` 写入链上 (`keccak256(<policyCode>)`)，前端通过 `RESOLUTION_RULES` (`packages/shared/src/constants.ts`) 显示可读规则。`packages/shared/src/commercial-resolution.ts` 提供与下列规则等价的纯函数 `resolveCommercialMarketOutcome(...)`，被 API、运营脚本和测试共用。

## 1. Match Winner（主市场）

Policy code：`full_time_match_winner_excluding_extra_time_and_penalties`

适用市场：`fixture:<fifaMatchId>:match_winner`，outcome count = 3。

Outcomes：

| index | label |
| --- | --- |
| 0 | Home |
| 1 | Draw |
| 2 | Away |

规则：

- 以全场常规时间 90 分钟 + 补时为准，不含加时、不含点球大战。
- `homeScore > awayScore` → Home 获胜。
- `homeScore == awayScore` → Draw。
- `homeScore < awayScore` → Away 获胜。
- 比赛 postponed / abandoned / cancelled 且不重赛 → market voided + refund。
- 关键数据源 mismatch（队伍 / kickoff）→ 阻断 propose result。

close time：`kickoffAtUtc + 105 分钟`（覆盖常规时间 + 补时 + 安全 buffer），常量 `XLAYER_MATCH_WINNER_CLOSE_BUFFER_SECONDS`。

## 2. Exact Score（次级市场）

Policy code：`full_time_exact_score_or_other_score`

适用市场：`fixture:<fifaMatchId>:exact_score`，outcome count = 10（默认）。

默认 outcome：

| index | label |
| --- | --- |
| 0 | 0-0 |
| 1 | 1-0 |
| 2 | 0-1 |
| 3 | 1-1 |
| 4 | 2-0 |
| 5 | 0-2 |
| 6 | 2-1 |
| 7 | 1-2 |
| 8 | 2-2 |
| 9 | Other score |

规则：

- 比赛范围同 `match_winner`（常规时间 + 补时，不含加时和点球）。
- 最终比分与某个列出的 outcome label 完全匹配 → 该 outcome 获胜。
- 比分不在列出的常见选项 → `Other score` 获胜。
- provider 缺少某个比分盘口时，前端 OutcomeCard 显示 `No provider odds`，但市场仍可保留；禁止伪造盘口。
- 比赛 voided 时与 match_winner 同步退款。

## 3. Goal Window Markets（Legacy，UI 不暴露）

Policy code：`goal_window_5m` / `goal_window_10m` / `goal_window_15m`

适用市场：`fixture:<fifaMatchId>:goal_window:<start>:<end>`。

规则：

- Yes 获胜：窗口 `[startMatchSecond, endMatchSecond)` 内出现 ≥ 1 个 confirmed、非 cancelled 的 goal。
- No 获胜：窗口内没有 confirmed goal。
- VAR 取消的进球不计入。
- result proposal 必须附 evidence URI 与 dataSourceHash。
- challenge deadline 未过前禁止自动 finalize。

当前产品没有 UI 入口；合约和测试仍保留。任何重新打开都必须通过 feature flag `enableLiveGoalWindow` + staging review-fix。

## 4. Next Goal Team（路线，未开放）

Policy code：`next_goal_team`

- Home / Away / `No goal before full time` 三个 outcome。
- 多 outcome 合约支持完成后再上线。
- VAR 取消的进球不计入「下一粒」。

## 5. Challenge / Void / Refund

- 任何被挑战的 proposal 不能自动 finalize。
- 管理员 / operator 裁决必须写 audit log。
- 关键数据源 / 盘口 mismatch 可触发 pause；持续无法解决 → void + refund。
- void → 所有 outcome 等比 payout，用户在 `/portfolio` 看到 `Voided` group 并可申请 refund。
- finalize 后即使发现 critical mismatch，也不会动已 finalized 的 redeem；只有 admin 裁决 + 审计日志记录。

## 6. 时间与时区

- 所有 `kickoffAtUtc`、`closeTime` 一律使用 UTC，前端按用户时区展示。
- close time 由链上 `block.timestamp` 判断，不依赖前端时间。
- 数据源时间戳保留 provider 原始 timezone 和 UTC normalized 两份。
