# Resolution Rules

## Goal Window Markets

For `goal_window_5m`, `goal_window_10m`, and `goal_window_15m`:

- Yes wins when at least one confirmed, non-cancelled goal occurs within `[startMatchSecond, endMatchSecond)`.
- No wins when no confirmed goal occurs in the window.
- VAR-cancelled goals do not count.
- The result proposal must include evidence URI and data source hash.
- Automatic finalize is blocked until the challenge deadline has passed.

## Next Goal Team

For `next_goal_team`:

- Home team wins when the next confirmed goal is by the home team.
- Away team wins when the next confirmed goal is by the away team.
- No goal before full time wins when no confirmed goal arrives before the market end.
- Chain creation remains gated until multi-outcome contract support is enabled.

## Challenge And Void

- A challenged proposal cannot be automatically finalized.
- Admin/operator resolution must be audited.
- Critical data or odds mismatch can pause or void a market and queue refunds.
