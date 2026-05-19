import { describe, expect, test } from "bun:test";
import { resolveCommercialMarketOutcome, type MatchEvent } from "./index";

const goal = (id: string, team: string, second: number, cancelled = false): MatchEvent => ({
  id,
  fixtureId: "fixture-1",
  providerEventId: id,
  eventType: cancelled ? "goal_cancelled" : "goal",
  team,
  matchMinute: Math.floor(second / 60),
  matchSecond: second,
  isConfirmed: !cancelled,
  isCancelled: cancelled,
  source: "fifa_official",
});

describe("commercial market resolution", () => {
  test("resolves goal windows using configured duration", () => {
    expect(resolveCommercialMarketOutcome({ marketType: "goal_window_5m", homeTeam: "Brazil", awayTeam: "Morocco", startMatchSecond: 3780, endMatchSecond: 4080, events: [goal("g1", "Brazil", 3900)] })).toEqual({ winningOutcome: 0, reason: "goal_in_window" });
    expect(resolveCommercialMarketOutcome({ marketType: "goal_window_10m", homeTeam: "Brazil", awayTeam: "Morocco", startMatchSecond: 3780, endMatchSecond: 4380, events: [goal("g2", "Brazil", 4500)] })).toEqual({ winningOutcome: 1, reason: "no_goal_in_window" });
  });

  test("rejects unsupported commercial resolution types", () => {
    expect(() => resolveCommercialMarketOutcome({ marketType: "next_card_team", homeTeam: "Brazil", awayTeam: "Morocco", startMatchSecond: 3780, endMatchSecond: 5400, events: [] })).toThrow("Resolution is not enabled");
  });

  test("resolves next goal team and ignores cancelled goals", () => {
    expect(resolveCommercialMarketOutcome({ marketType: "next_goal_team", homeTeam: "Brazil", awayTeam: "Morocco", startMatchSecond: 3780, endMatchSecond: 5400, events: [goal("cancelled", "Brazil", 3840, true), goal("away", "Morocco", 3900)] })).toEqual({ winningOutcome: 1, reason: "next_goal_away" });
    expect(resolveCommercialMarketOutcome({ marketType: "next_goal_team", homeTeam: "Brazil", awayTeam: "Morocco", startMatchSecond: 3780, endMatchSecond: 5400, events: [] })).toEqual({ winningOutcome: 2, reason: "no_goal_before_full_time" });
  });
});
