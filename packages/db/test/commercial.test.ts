import { describe, expect, test } from "bun:test";
import { InMemoryDb } from "../src/client";
import { getRepositoryMode } from "../src/repository";
import {
  DEMO_FIXTURE_ID,
  WORLDCUP_2026_GROUP_STAGE_FIXTURES,
  WORLDCUP_2026_GROUP_STAGE_MATCH_COUNT,
} from "@polygoal/shared";

describe("commercial db facade", () => {
  test("stores feature flags, risk limits, provider health, audit logs, pauses and operator actions", () => {
    const db = new InMemoryDb();
    expect(db.getFeatureFlags().enableMatchWinnerMarket).toBe(true);
    db.setFeatureFlag("enableGeoBlock", true, "operator-1");
    expect(db.getFeatureFlags().enableGeoBlock).toBe(true);
    expect(db.state.auditLogs.at(-1)?.action).toBe("feature_flag.updated");

    db.upsertRiskLimit({ scope: "market", subjectId: "market-demo-63-73", maxOrderAmountRaw: "1000", maxUserExposureRaw: "2000", maxMarketVolumeRaw: "3000", enabled: true });
    expect(db.getRiskLimit("market", "market-demo-63-73")?.maxOrderAmountRaw).toBe("1000");

    db.recordProviderHealth({ provider: "provider_a", status: "delayed", latencyMs: 500, lastUpdateAgeSeconds: 45, details: { fixtureId: DEMO_FIXTURE_ID } });
    const pause = db.autoPauseMarketForProviderDelay("market-demo-63-73", "provider delay");
    expect(pause.status).toBe("active");
    expect(db.state.operatorActions.at(-1)?.actionType).toBe("market_paused");
    db.resumeMarket("market-demo-63-73", "operator-1", "provider recovered");
    expect(db.state.marketPauses.at(-1)?.status).toBe("resolved");
  });

  test("covers repository mode and liquidity snapshots", () => {
    const db = new InMemoryDb();
    expect(getRepositoryMode({} as unknown as NodeJS.ProcessEnv)).toBe("memory");
    expect(getRepositoryMode({ DATABASE_URL: "postgres://local" } as unknown as NodeJS.ProcessEnv)).toBe("postgres");
    const snapshot = db.recordLiquiditySnapshot({ marketId: "market-demo-63-73", liquidityRaw: "100", volumeRaw: "10", inventoryRiskBps: 50 });
    expect(snapshot.id).toBe("liquidity:1");
  });

  test("creates winner-first commercial market definitions without time windows", () => {
    const db = new InMemoryDb();
    const winner = db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "match_winner", startMatchSecond: 0 });
    const exactScore = db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "exact_score", startMatchSecond: 0 });
    expect(winner.outcomes.map((outcome) => outcome.label)).toEqual(["Brazil", "Draw", "Morocco"]);
    expect(winner.isFeatured).toBe(true);
    expect(exactScore.outcomes.find((outcome) => outcome.label === "1-0")?.providerOdds?.source).toBe("provider_a");
    const demoMarkets = db.listCommercialMarkets({ fixtureId: DEMO_FIXTURE_ID });
    expect(demoMarkets.map((market) => market.marketType).sort()).toEqual(["exact_score", "match_winner"]);
  });

  test("seeds every World Cup 2026 group stage fixture with both match_winner and exact_score pools", () => {
    const db = new InMemoryDb();
    expect(WORLDCUP_2026_GROUP_STAGE_MATCH_COUNT).toBe(72);
    expect(db.listCommercialMarkets().length).toBe(WORLDCUP_2026_GROUP_STAGE_MATCH_COUNT * 2);
    for (const fixture of WORLDCUP_2026_GROUP_STAGE_FIXTURES) {
      const pools = db.listCommercialMarkets({ fixtureId: fixture.id });
      const types = pools.map((pool) => pool.marketType).sort();
      expect(types).toEqual(["exact_score", "match_winner"]);
    }
  });

  test("bootstrapScheduleMarkets is idempotent and reports counts", () => {
    const db = new InMemoryDb();
    const initialPoolCount = db.listCommercialMarkets().length;
    const summary = db.bootstrapScheduleMarkets();
    expect(summary.fixturesCount).toBe(WORLDCUP_2026_GROUP_STAGE_MATCH_COUNT);
    expect(summary.matchWinnerCreated).toBe(0);
    expect(summary.exactScoreCreated).toBe(0);
    expect(summary.matchWinnerExisting).toBe(WORLDCUP_2026_GROUP_STAGE_MATCH_COUNT);
    expect(summary.exactScoreExisting).toBe(WORLDCUP_2026_GROUP_STAGE_MATCH_COUNT);
    expect(summary.totalPools).toBe(initialPoolCount);
    expect(db.listCommercialMarkets().length).toBe(initialPoolCount);
  });
});
