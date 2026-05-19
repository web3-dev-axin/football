import { describe, expect, test } from "bun:test";
import { buildDemoOddsSnapshots, compareOddsSnapshots, syncDemoOdds } from "./index";
import { normalizeOddsProbabilities } from "./normalizers/odds";

describe("odds ingestion", () => {
  test("compares provider odds and flags critical outliers", () => {
    const [official, provider] = buildDemoOddsSnapshots({ providerProbabilityBps: 7200 });
    const comparison = compareOddsSnapshots(official, provider);
    expect(comparison.status).toBe("data_review_required");
    expect(comparison.maxDeviationBps).toBe(2200);
    expect(comparison.mismatches[0]?.action).toBe("auto_pause_market");
  });

  test("syncs verified demo odds when deviation is inside tolerance", () => {
    const result = syncDemoOdds({ providerProbabilityBps: 5100 });
    expect(result.comparison.status).toBe("verified");
    expect(result.comparison.maxDeviationBps).toBe(100);
    expect(result.snapshots).toHaveLength(2);
  });

  test("normalizes multi-outcome odds to exactly 10000 bps", () => {
    const [snapshot] = buildDemoOddsSnapshots();
    const normalized = normalizeOddsProbabilities({ ...snapshot, outcomeProbabilitiesBps: [1, 1, 1] });
    expect(normalized.reduce((sum, probability) => sum + probability, 0)).toBe(10_000);
    expect(normalized).toEqual([3334, 3333, 3333]);
  });
});
