import { describe, expect, test } from "bun:test";
import {
  COMMERCIAL_MARKET_TYPES,
  DEFAULT_COMMERCIAL_FEATURE_FLAGS,
  DEFAULT_RISK_LIMITS,
  buildExactScoreMarketDefinition,
  buildMatchWinnerMarketDefinition,
  evaluateRiskOrder,
  shouldAutoPauseForProviderHealth,
  type ProviderHealthCheck,
} from "./index";

describe("commercial domain helpers", () => {
  test("defines winner-first commercial markets without time-window products", () => {
    expect(COMMERCIAL_MARKET_TYPES.map((market) => market.marketType)).toEqual([
      "match_winner",
      "exact_score",
    ]);
    expect(COMMERCIAL_MARKET_TYPES.every((market) => market.enabledByDefault)).toBe(true);
  });

  test("builds match winner market metadata as the featured product", () => {
    const market = buildMatchWinnerMarketDefinition({ fixtureId: "demo-2026-001", homeTeam: "Brazil", awayTeam: "Morocco" });
    expect(market.marketType).toBe("match_winner");
    expect(market.outcomes.map((outcome) => outcome.label)).toEqual(["Brazil", "Draw", "Morocco"]);
    expect(market.marketCategory).toBe("core");
    expect(market.isFeatured).toBe(true);
    expect(market.title).toBe("Brazil vs Morocco");
  });

  test("builds exact score market with provider odds metadata", () => {
    const market = buildExactScoreMarketDefinition({ fixtureId: "demo-2026-001", homeTeam: "Brazil", awayTeam: "Morocco" });
    expect(market.marketType).toBe("exact_score");
    expect(market.marketCategory).toBe("score");
    expect(market.isFeatured).toBe(false);
    expect(market.outcomes.map((outcome) => outcome.label)).toContain("1-0");
    expect(market.outcomes.find((outcome) => outcome.label === "1-0")?.providerOdds?.source).toBe("provider_a");
    expect(market.outcomes.find((outcome) => outcome.label === "Other score")?.providerOdds?.status).toBe("available");
  });

  test("evaluates feature flags and risk limits for trades", () => {
    expect(DEFAULT_COMMERCIAL_FEATURE_FLAGS.enableMatchWinnerMarket).toBe(true);
    expect(DEFAULT_COMMERCIAL_FEATURE_FLAGS.enableExactScoreMarket).toBe(true);
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
