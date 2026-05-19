# 前端按钮真实交互测试报告

- 测试时间：2026-05-19
- 测试方式：Playwright CLI 真实 Chromium 浏览器，逐键点击 + DOM 状态断言
- 前端：http://127.0.0.1:3000 (Next 16.2.6 dev, Turbopack)
- 后端 API：http://127.0.0.1:8787 (Bun + Hono, in-memory demo)
- 链：X Layer testnet (chainId 1952)
- 钱包环境：Playwright 无 `window.ethereum` 注入。所有钱包相关按钮预期处于 "Install/Connect" 态——这是用户没装钱包时的真实表现。

## 0. 清理（按用户要求"旧页面不用的先删了"）

| 操作 | 文件 |
|---|---|
| 删除 | `apps/web/app/live/page.tsx` 及目录 |
| 删除 | `apps/web/app/schedule/page.tsx` 及目录 |
| 删除 | `apps/web/app/settlement/page.tsx` 及目录 |
| 修复 | `apps/web/components/ui/SiteNavigation.tsx` 移除 `/schedule` 路径匹配 |
| 修复 | `docs/development.md` 改写"关键页面"列表为现有路由 |
| 修复 | `scripts/full-flow-test-report.ts` 去掉 `SellPanel` 这种废弃组件描述 |

HTTP 验证：

```
/live        -> 404
/schedule    -> 404
/settlement  -> 404
/            -> 200
/portfolio   -> 200
/settlements -> 200
/operator    -> 200 (需 NEXT_PUBLIC_OPERATOR_CONSOLE_ENABLED=true)
/markets/demo-2026-001:match_winner -> 200
/matches/demo-2026-001 -> 302 -> /markets/demo-2026-001:match_winner (server redirect)
```

---

## 1. 全局导航（layout.tsx）

| 按钮 | 真实点击效果 | 结果 |
|---|---|---|
| `polygoal` 品牌 link | 任意页 → `/` | ✅ |
| 桌面 nav `Markets` | → `/` | ✅ |
| 桌面 nav `Portfolio` | → `/portfolio` | ✅ |
| 桌面 nav `Settlements` | → `/settlements` | ✅ |
| 钱包 pill | 未注入钱包：disabled，label "Install wallet" + 网络 "X Layer" | ✅ 但见 §A |
| 移动 tabbar（≤768px） | display=flex, position=fixed；Markets/Portfolio/Settlements 三个 tab 均能跳转并正确切换 active 状态 | ✅ |

> 测试环境：在 390×844 视口下确认 `.nav-links` display=none，`.mobile-tabbar` position=fixed 可见。

## 2. 首页 `/`

72 个赛事数据正常加载，11 个 day pills（Live + 10 天）。

| 按钮 | 真实点击效果 | 结果 |
|---|---|---|
| Hero CTA `1 live match` | 跳到 `/#live` 锚点，URL 立即变化 | ✅ |
| Hero CTA `My positions` | → `/portfolio` | ✅ |
| DayJumper `Live` pill | → `/#live` | ✅ |
| DayJumper 日期 pill (Wed Jun 10…) | → `/#day-2026-06-11` 等锚点，scroll-spy 高亮切换正常 | ✅ 但见 §B |
| 赛事卡 board（标题区） | → `/markets/{fixtureId}:match_winner` | ✅ |
| 赛事卡 action `Match winner` | → 同上 | ✅ |
| 赛事卡 action `Exact score` | → `/markets/{fixtureId}:match_winner?market=exact_score` | ✅ |

实际抓样：

- Brazil vs Morocco (live) board → `/markets/demo-2026-001:match_winner` ✅
- Serbia vs Cameroon (scheduled) board → `/markets/fixture:worldcup-2026-002:match_winner` ✅
- Match winner & Exact score action 两个跳转均正常

## 3. 比赛页 `/markets/{fixtureId}:match_winner`

以 live 比赛 (Brazil vs Morocco) 为例，3 outcomes（Brazil 60% / Draw 22% / Morocco 19%）。

### 3.1 上方市场区

| 按钮 | 操作 | 结果 |
|---|---|---|
| 产品 tab `Match winner` | 默认选中 | ✅ |
| 产品 tab `Exact score` | 切到 exact score 网格 (9 cells + Other)，URL 加 `?market=exact_score&outcome=0`，trade ticket 自动跟随 | ✅ |
| Outcome card `Brazil` | aria-pressed=true，trade ticket 显示 You're backing Brazil / Price $0.60 | ✅ |
| Outcome card `Draw` | trade ticket 切换为 Draw / $0.22，URL 加 `outcome=1` | ✅ |
| Outcome card `Morocco` | trade ticket 切换为 Morocco / $0.19，URL 加 `outcome=2` | ✅ |
| Exact-score cell `2-1` | trade ticket → 2-1 / $0.10，URL `outcome=6` | ✅ |
| Exact-score cell `Other score` | trade ticket → Other score，URL `outcome=9` | ✅ |
| Exact-score "Preview only" 提示 | 因 demo 的 exact_score 池尚未上链，提示横幅出现 | ✅ |

### 3.2 右侧 TradeTicket

| 按钮 | 操作 | 结果 |
|---|---|---|
| Buy / Sell 双 tab | Buy 默认选中；Sell 在未持仓时正确 disabled，title="You don't hold any shares yet" | ✅ |
| 金额输入框 | 默认 100，可手动改 | ✅ |
| 预设 `$10/$50/$100/$500` | 点击后输入框相应变 10/50/100/500 | ✅ |
| 预设 `Max` | 未连接钱包时退化到 500（代码逻辑） | ✅ |
| 主 CTA `Buy Brazil` | disabled，label 显示 "Insufficient USDC" + "Win up to $X.XX" 副文案 | ⚠️ 见 §C |
| 引用条 `1:1 USDC collateral · ...` | 静态显示，提示 "USDC approval required" | ✅ |

### 3.3 其余面板

- Live feed 列表：8 条事件（goal/VAR/half/full time）正常渲染。
- Settlement rules 卡片：规则文本 + Challenge window 10 minutes 显示。
- 这些都不是按钮，但和按钮联动正常。

## 4. 投资组合 `/portfolio`

无钱包时进入。

| 按钮 | 操作 | 结果 |
|---|---|---|
| `Connect wallet`（empty state） | 触发 `connect()`：无 provider 时设置 wallet status=error，错误文案 "Install a browser wallet to continue" | ✅ |
| BalanceFaucet `Install a wallet to continue` | 提示 "We could not detect a browser wallet. Install MetaMask or another EIP-1193 wallet, then refresh." | ✅ |
| Balance 显示 | `$0.00`（未连接） | ✅ |

> Portfolio 持仓/Redeem/Refund 按钮路径依赖钱包注入 + 链上数据，本次仅能验证未连接态。这些代码在 `PositionRow.tsx` 中已完整实现，需要真钱包测试。

## 5. 结算 `/settlements`

API `/settlements` 当前返回空（无 proposal）。

| 按钮 | 操作 | 结果 |
|---|---|---|
| Empty state `View markets` link | → `/` | ✅ |
| `Challenge` 按钮 | 没有 proposal 可测，UI 已经写好且 `enablePublicChallenge=false` 时也会 disable | （未触发） |

> `Challenge` 按钮的真实交互需要 seed 一条 ResultProposal 才能点。当前 API 没暴露 admin seed 接口，建议下次跑 e2e 时通过 `bun --cwd packages/db demo:seed-settlements` 之类灌入再测。

## 6. `/operator`（需 `NEXT_PUBLIC_OPERATOR_CONSOLE_ENABLED=true`）

| 元素 | 验证 |
|---|---|
| h1 `Operator Console` | ✅ |
| 4 个区块：Feature Flags / Risk Limits / Market Operations / Audit Trail | ✅ |
| 任何按钮/链接 | 0 个——目前是纯展示页 |

## 7. `/matches/[fixtureId]` redirect

`/matches/demo-2026-001` → `/markets/demo-2026-001:match_winner`（server-side 302）：✅

---

## 问题清单（需要修复）

### A. WalletPill 错误态文案过长导致 nav 拥挤

未注入钱包时，从 `/portfolio` 的 "Connect wallet" 点击后，`WalletProvider` 进入 status=error 并把 `errorMessage="Install a browser wallet to continue"` 推到 `WalletPill`。`WalletPill` 直接把这段长文案当 label：

```50:58:apps/web/components/wallet/WalletPill.tsx
    return (
      <button
        aria-label={`${label} on ${APP_CHAIN.name}`}
        className="badge wallet-button"
        disabled={status === "connecting" || !hasInjectedProvider}
        onClick={() => void connect()}
        type="button"
      >
```

导致 nav 上 pill 文本是 `Install a browser wallet to continueX Layer`（"continue" 和 "X Layer" 之间没有视觉间隔）。建议错误态在 nav 上回退到简短 "Install wallet"，详细提示放 aria-label + tooltip。

### B. DayJumper 时区错位

代码用 UTC date 当 group key，但 `toLocaleDateString` 用本地时区生成 label：

```23:32:apps/web/app/page.tsx
function relativeDayLabel(dateKey: string): { label: string; sublabel: string } {
  const today = new Date(`${todayIso()}T00:00:00Z`);
  const target = new Date(`${dateKey}T00:00:00Z`);
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const sublabel = target.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  if (diff === 0) return { label: "Today", sublabel };
  if (diff === 1) return { label: "Tomorrow", sublabel };
  if (diff === -1) return { label: "Yesterday", sublabel };
  return { label: target.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }), sublabel };
}
```

在 UTC-7 浏览器里，dateKey `2026-06-11` 渲染成 `Wed, Jun 10`，于是 pill 文字写 "Wed, Jun 10" 但 anchor 是 `#day-2026-06-11`。功能没坏（anchor 还是能跳到正确 section），但用户视觉上会困惑。建议把 `isoDate()` 也改成用浏览器本地时区生成 group key，或者反过来固定用 UTC 格式化 label。

### C. TradeTicket 未连接钱包时误报 "Insufficient USDC"

```192:197:apps/web/components/markets/TradeTicket.tsx
  const ctaLabel = notDeployed
    ? "Coming soon"
    : insufficientBalance
      ? "Insufficient USDC"
      : ctaLabelFor({ status, mode, outcomeLabel: outcome?.label, tradingOpen, needsApproval, riskBlocked, insufficientShares, amount, sharesHeldRaw });
```

`insufficientBalance` 的检查在 wallet-connect 检查之前，未连接时 `usdcBalanceRaw=0n`，导致 CTA 直接显示 "Insufficient USDC"。但用户根本没连钱包，应该先看到 "Connect wallet to trade"。建议在 `insufficientBalance` 之前先判 `!wallet.connected` 走 `ctaLabelFor` 分支。

### D. Turbopack Fast Refresh 偶发 sharesHeldRaw 报错（已自愈）

在删除 `/live`、`/schedule`、`/settlement` 三个页面后 Turbopack HMR 一次性报：

```
[browser] Uncaught ReferenceError: sharesHeldRaw is not defined
    at TradeTicket (components/markets/TradeTicket.tsx:199:39)
⚠ Fast Refresh had to perform a full reload due to a runtime error.
```

随后 dev server 进程退出。重启 dev server 后无法复现，源码 `sharesHeldRaw` 定义完整。这是 Turbopack HMR 在文件树发生 routing 变化时的偶发问题，**不是源码 bug**。如果再次出现请直接 `lsof -ti:3000 | xargs kill -9 && next dev`。

### E. favicon 404（极低优先级）

`GET /favicon.ico` 返回 404，浏览器 console 报一次。建议在 `apps/web/app/` 放 `icon.svg` 或 `favicon.ico`。

---

## 总结

- 已成功删除 3 个废弃的 redirect 页面 + 相关引用清理；
- Playwright 真实点击覆盖了 **导航 / Hero CTA / DayJumper / 赛事卡 / Outcome / Product tab / Exact-score 网格 / Buy-Sell tab / 预设金额 / 钱包按钮 / Faucet / Empty-state CTA / 移动 tabbar**，所有跳转和状态切换都正确；
- 未注入钱包导致 redeem / refund / challenge / mint 等链上动作无法点穿到 tx 层——若需要这一层 e2e，必须用 metamask-like extension headfull 模式或直接调 SDK。这超出"前端按钮"的测试范围。
- 报告中标记的 4 个真实 bug：A / B / C / D（D 是偶发，源码无错），加上 E 这个 favicon 404，整体可分批修。
