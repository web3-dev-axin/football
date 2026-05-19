import { describe, expect, test } from "bun:test";
import { resolveCommercialMarketOutcome } from "./index";

describe("commercial market resolution", () => {
  test("resolves match winner from full-time score", () => {
    expect(resolveCommercialMarketOutcome({ marketType: "match_winner", homeTeam: "Brazil", awayTeam: "Morocco", startMatchSecond: 0, endMatchSecond: 5400, events: [], homeScore: 2, awayScore: 1 })).toEqual({ winningOutcome: 0, reason: "match_winner_home" });
    expect(resolveCommercialMarketOutcome({ marketType: "match_winner", homeTeam: "Brazil", awayTeam: "Morocco", startMatchSecond: 0, endMatchSecond: 5400, events: [], homeScore: 1, awayScore: 1 })).toEqual({ winningOutcome: 1, reason: "match_winner_draw" });
    expect(resolveCommercialMarketOutcome({ marketType: "match_winner", homeTeam: "Brazil", awayTeam: "Morocco", startMatchSecond: 0, endMatchSecond: 5400, events: [], homeScore: 0, awayScore: 1 })).toEqual({ winningOutcome: 2, reason: "match_winner_away" });
  });

  test("resolves exact score and falls back to other score", () => {
    expect(resolveCommercialMarketOutcome({ marketType: "exact_score", homeTeam: "Brazil", awayTeam: "Morocco", startMatchSecond: 0, endMatchSecond: 5400, events: [], homeScore: 2, awayScore: 1 })).toEqual({ winningOutcome: 6, reason: "exact_score" });
    expect(resolveCommercialMarketOutcome({ marketType: "exact_score", homeTeam: "Brazil", awayTeam: "Morocco", startMatchSecond: 0, endMatchSecond: 5400, events: [], homeScore: 4, awayScore: 3 })).toEqual({ winningOutcome: 9, reason: "other_score" });
  });
});
