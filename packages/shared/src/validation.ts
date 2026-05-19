import Decimal from "decimal.js";
import { USDC_DECIMALS } from "./constants";
import { OUTCOME, type AmountView, type DataMismatch, type DataQualityStatus, type Fixture, type LiveWindow, type MatchEvent, type OutcomeIndex } from "./types";

export function assertOutcomeIndex(value: number): asserts value is OutcomeIndex {
  if (value !== OUTCOME.YES && value !== OUTCOME.NO) {
    throw new Error(`Invalid outcome index: ${value}`);
  }
}

export function makeWindowKey(fixtureId: string, startMatchSecond: number, endMatchSecond: number): string {
  return `fixture:${fixtureId}:goal_window:${startMatchSecond}:${endMatchSecond}`;
}

export function formatAmount(raw: string | bigint, decimals = USDC_DECIMALS): AmountView {
  const rawDecimal = new Decimal(raw.toString());
  const divisor = new Decimal(10).pow(decimals);
  return {
    raw: raw.toString(),
    decimals,
    formatted: rawDecimal.div(divisor).toFixed(decimals).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1"),
  };
}

export function countConfirmedGoalsInWindow(events: MatchEvent[], window: Pick<LiveWindow, "startMatchSecond" | "endMatchSecond">): number {
  const cancelledSeconds = new Set(
    events.filter((event) => event.eventType === "goal_cancelled" && event.isConfirmed).map((event) => event.matchSecond),
  );

  return events.filter((event) => {
    const inWindow = event.matchSecond >= window.startMatchSecond && event.matchSecond < window.endMatchSecond;
    return inWindow && event.eventType === "goal" && event.isConfirmed && !event.isCancelled && !cancelledSeconds.has(event.matchSecond);
  }).length;
}

export function outcomeForGoalCount(goalCount: number): OutcomeIndex {
  return goalCount > 0 ? OUTCOME.YES : OUTCOME.NO;
}

export function compareFixtureSnapshots(official: Fixture, provider: Fixture): { status: DataQualityStatus; mismatches: DataMismatch[] } {
  const checks: Array<[keyof Fixture, "critical" | "warning"]> = [
    ["fifaMatchId", "critical"],
    ["homeTeam", "critical"],
    ["awayTeam", "critical"],
    ["kickoffAtUtc", "critical"],
    ["venue", "critical"],
    ["status", "warning"],
  ];

  const mismatches = checks.flatMap(([field, severity]) => {
    if (official[field] === provider[field]) return [];
    return [{
      field,
      officialValue: official[field],
      providerValue: provider[field],
      severity,
      action: severity === "critical" ? "block_market_creation" as const : "record_warning" as const,
    }];
  });

  return {
    status: mismatches.some((mismatch) => mismatch.severity === "critical") ? "data_review_required" : "verified",
    mismatches,
  };
}

export function requireVerified(status: DataQualityStatus, code: string): void {
  if (status !== "verified") {
    throw Object.assign(new Error(code), { code });
  }
}
