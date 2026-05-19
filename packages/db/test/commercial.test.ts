import { describe, expect, test } from "bun:test";
import { InMemoryDb } from "../src/client";
import { getRepositoryMode } from "../src/repository";
import { DEMO_FIXTURE_ID } from "@worldcup/shared";

describe("commercial db facade", () => {
  test("stores feature flags, risk limits, provider health, audit logs, pauses and operator actions", () => {
    const db = new InMemoryDb();
    expect(db.getFeatureFlags().enableNextGoalMarket).toBe(true);
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

  test("creates commercial market definitions for 5/10/15 minute and next-goal markets", () => {
    const db = new InMemoryDb();
    const five = db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "goal_window_5m", startMatchSecond: 3780 });
    const fifteen = db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "goal_window_15m", startMatchSecond: 3780 });
    const nextGoal = db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "next_goal_team", startMatchSecond: 3780, endMatchSecond: 5400 });
    expect(five.windowKey).toContain("goal_window_5m");
    expect(fifteen.endMatchSecond - fifteen.startMatchSecond).toBe(900);
    expect(nextGoal.outcomes.map((outcome) => outcome.label)).toEqual(["Brazil", "Morocco", "No goal before full time"]);
    expect(nextGoal.chainCreationEnabled).toBe(false);
  });
});
