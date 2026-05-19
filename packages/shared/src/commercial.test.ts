import { describe, expect, test } from "bun:test";
import {
  COMMERCIAL_MARKET_TYPES,
  DEFAULT_COMMERCIAL_FEATURE_FLAGS,
  DEFAULT_RISK_LIMITS,
  buildGoalWindowMarketDefinition,
  buildNextGoalMarketDefinition,
  evaluateRiskOrder,
  shouldAutoPauseForProviderHealth,
  type ProviderHealthCheck,
} from "./index";

describe("commercial domain helpers", () => {
  test("defines commercial market matrix with goal windows and next goal market", () => {
    expect(COMMERCIAL_MARKET_TYPES.map((market) => market.marketType)).toEqual([
      "goal_window_5m",
      "goal_window_10m",
      "goal_window_15m",
      "next_goal_team",
      "half_remaining_goal",
      "next_card_team",
      "next_corner_team",
    ]);
    expect(COMMERCIAL_MARKET_TYPES.find((market) => market.marketType === "next_card_team")?.enabledByDefault).toBe(false);
  });

  test("builds configurable 5/10/15 minute goal window metadata", () => {
    const market = buildGoalWindowMarketDefinition({ fixtureId: "demo-2026-001", homeTeam: "Brazil", awayTeam: "Morocco", startMatchSecond: 3780, durationMinutes: 5 });
    expect(market.marketType).toBe("goal_window_5m");
    expect(market.outcomes.map((outcome) => outcome.label)).toEqual(["Yes", "No"]);
    expect(market.windowKey).toBe("fixture:demo-2026-001:goal_window_5m:3780:4080");
  });

  test("builds next-goal market metadata only through commercial definition", () => {
    const market = buildNextGoalMarketDefinition({ fixtureId: "demo-2026-001", homeTeam: "Brazil", awayTeam: "Morocco", startMatchSecond: 3780, endMatchSecond: 5400 });
    expect(market.marketType).toBe("next_goal_team");
    expect(market.outcomes.map((outcome) => outcome.label)).toEqual(["Brazil", "Morocco", "No goal before full time"]);
    expect(market.chainCreationEnabled).toBe(false);
  });

  test("evaluates feature flags and risk limits for trades", () => {
    expect(DEFAULT_COMMERCIAL_FEATURE_FLAGS.enableNextGoalMarket).toBe(true);
    expect(DEFAULT_COMMERCIAL_FEATURE_FLAGS.enableCardMarket).toBe(false);
    expect(evaluateRiskOrder({ userExposureRaw: "100", marketVolumeRaw: "100", orderAmountRaw: "10", limits: DEFAULT_RISK_LIMITS }).allowed).toBe(true);
    expect(evaluateRiskOrder({ userExposureRaw: DEFAULT_RISK_LIMITS.maxUserExposureRaw, marketVolumeRaw: "0", orderAmountRaw: "1", limits: DEFAULT_RISK_LIMITS }).reason).toBe("USER_LIMIT_EXCEEDED");
  });

  test("auto pauses when provider health is delayed or mismatched", () => {
    const healthy: ProviderHealthCheck = { id: "h1", provider: "provider_a", status: "healthy", latencyMs: 120, lastUpdateAgeSeconds: 2, checkedAt: "2026-06-13T22:00:00.000Z", details: {} };
    const delayed: ProviderHealthCheck = { ...healthy, id: "h2", status: "delayed", lastUpdateAgeSeconds: 35 };
    const mismatched: ProviderHealthCheck = { ...healthy, id: "h3", status: "mismatched" };
    expect(shouldAutoPauseForProviderHealth([healthy])).toBe(false);
    expect(shouldAutoPauseForProviderHealth([delayed])).toBe(true);
    expect(shouldAutoPauseForProviderHealth([mismatched])).toBe(true);
  });
});
