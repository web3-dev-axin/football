import { describe, expect, test } from "bun:test";
import { DEMO_FIXTURE, makeWindowKey, assertOutcomeIndex, formatAmount, requireVerified, compareFixtureSnapshots, outcomeForGoalCount } from "./index";

describe("shared validation helpers", () => {
  test("validates outcome indices and derives window keys", () => {
    expect(() => assertOutcomeIndex(0)).not.toThrow();
    expect(() => assertOutcomeIndex(2)).toThrow("Invalid outcome index");
    expect(makeWindowKey("demo", 10, 20)).toBe("fixture:demo:goal_window:10:20");
  });

  test("formats raw amounts and derives outcome from goal count", () => {
    expect(formatAmount("100000000", 6)).toEqual({ raw: "100000000", decimals: 6, formatted: "100" });
    expect(formatAmount(1234500n, 6).formatted).toBe("1.2345");
    expect(outcomeForGoalCount(0)).toBe(1);
    expect(outcomeForGoalCount(2)).toBe(0);
  });

  test("compares warning and critical fixture mismatch states", () => {
    const warning = compareFixtureSnapshots(DEMO_FIXTURE, { ...DEMO_FIXTURE, status: "full_time" });
    expect(warning.status).toBe("verified");
    expect(warning.mismatches[0]?.action).toBe("record_warning");
    const critical = compareFixtureSnapshots(DEMO_FIXTURE, { ...DEMO_FIXTURE, venue: "Wrong Stadium" });
    expect(critical.status).toBe("data_review_required");
    expect(critical.mismatches[0]?.action).toBe("block_market_creation");
  });

  test("throws when data is not verified", () => {
    expect(() => requireVerified("verified", "BAD")).not.toThrow();
    expect(() => requireVerified("pending", "BAD")).toThrow("BAD");
  });
});
