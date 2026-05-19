import type { CommercialMarketDefinition, Fixture, Market, MarketStatus, ResultProposal } from "@polygoal/shared";

export type DisplayStatus = "live" | "opening" | "awaiting" | "settling" | "disputed" | "settled" | "voided";

export function displayStatusForMarket(market: Pick<Market, "status" | "oracleState">): DisplayStatus {
  if (market.status === "live_trading" || market.status === "closing_soon") return "live";
  if (market.status === "scheduled") return "opening";
  if (market.oracleState === "challenged" || market.status === "challenged") return "disputed";
  if (market.oracleState === "proposed" || market.status === "proposed") return "settling";
  if (market.status === "voided" || market.oracleState === "voided") return "voided";
  if (market.status === "redeemable" || market.status === "settled" || market.oracleState === "finalized") return "settled";
  return "awaiting";
}

export function displayStatusForCommercial(market: Pick<CommercialMarketDefinition, "fixtureId"> & { fixture?: Fixture }, fixture?: Fixture): DisplayStatus {
  const f = market.fixture ?? fixture;
  if (!f) return "opening";
  if (f.status === "live") return "live";
  if (f.status === "scheduled") return "opening";
  if (f.status === "cancelled" || f.status === "abandoned" || f.status === "postponed") return "voided";
  return "awaiting";
}

export function statusLabel(status: DisplayStatus): string {
  switch (status) {
    case "live": return "Live";
    case "opening": return "Pre-match";
    case "awaiting": return "Awaiting result";
    case "settling": return "Settling";
    case "disputed": return "Disputed";
    case "settled": return "Settled";
    case "voided": return "Voided";
  }
}

export function formatProbabilityBps(bps: number): string {
  return `${(bps / 100).toFixed(0)}%`;
}

export function formatUsdc(rawAmount: string | bigint, decimals = 6): string {
  const value = typeof rawAmount === "bigint" ? rawAmount : BigInt(rawAmount || "0");
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const frac = value % divisor;
  const cents = Number(frac) / Number(divisor);
  const display = Number(whole) + cents;
  if (display >= 1000) return `$${display.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${display.toFixed(2)}`;
}

export function formatMatchTime(fixture: Pick<Fixture, "status" | "displayClock" | "kickoffAtUtc">): string {
  if (fixture.status === "live") return `${fixture.displayClock} Live`;
  if (fixture.status === "scheduled") return new Date(fixture.kickoffAtUtc).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  if (fixture.status === "full_time" || fixture.status === "final") return "Full time";
  return fixture.status;
}

export function formatMatchScore(fixture: Pick<Fixture, "homeScore" | "awayScore" | "homeTeam" | "awayTeam">): string {
  return `${fixture.homeTeam} ${fixture.homeScore} - ${fixture.awayScore} ${fixture.awayTeam}`;
}

export function marketHref(marketId: string): string {
  return `/markets/${encodeURIComponent(marketId)}`;
}

export function fixtureMarketHref(fixtureId: string, product: "match_winner" | "exact_score" = "match_winner"): string {
  const base = marketHref(`${fixtureId}:match_winner`);
  return product === "exact_score" ? `${base}?market=exact_score` : base;
}

export function describeProposal(proposal: ResultProposal | undefined, market: Pick<Market, "outcomes"> | undefined): string {
  if (!proposal) return "No proposed result yet.";
  const outcome = market?.outcomes.find((candidate) => candidate.outcomeIndex === proposal.winningOutcome);
  if (!outcome) return `Proposed outcome ${proposal.winningOutcome}.`;
  return `Proposed: ${outcome.label}`;
}

export function marketStatusToCss(status: MarketStatus): string {
  switch (status) {
    case "live_trading":
    case "closing_soon":
      return "state-live";
    case "proposed":
    case "challenged":
      return "state-settling";
    default:
      return "state-settled";
  }
}
