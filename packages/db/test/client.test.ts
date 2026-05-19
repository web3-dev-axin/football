import { describe, expect, test } from "bun:test";
import { DEMO_FIXTURE, DEMO_FIXTURE_ID, DEMO_LIVE_WINDOW, countConfirmedGoalsInWindow } from "@worldcup/shared";
import { InMemoryDb, createDemoState, makeFixtureComparison, makeSnapshot } from "../src/client";

describe("InMemoryDb", () => {
  test("seeds verified demo fixture snapshots", () => {
    const state = createDemoState();
    expect(state.fixtures[0]?.dataQualityStatus).toBe("verified");
    expect(state.snapshots.map((snapshot) => snapshot.source).sort()).toEqual(["fifa_official", "sports_data_provider"]);
    expect(state.comparisons[0]?.criticalMismatchCount).toBe(0);
  });

  test("blocks live window creation when fixture data has a critical mismatch", () => {
    const db = new InMemoryDb();
    db.injectFixtureMismatch(DEMO_FIXTURE_ID, "kickoffAtUtc", "2026-06-13T22:00:00.000Z");
    expect(() => db.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 })).toThrow("Fixture data has critical mismatches");
  });

  test("creates live window and market once fixture data is verified", () => {
    const db = new InMemoryDb();
    const liveWindow = db.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 });
    const market = db.createMarket(liveWindow.id);
    expect(liveWindow.windowKey).toBe("fixture:demo-2026-001:goal_window:3780:4380");
    expect(market.outcomes.map((outcome) => outcome.label)).toEqual(["Yes", "No"]);
  });

  test("counts confirmed goals and ignores cancelled goals", () => {
    const db = new InMemoryDb();
    db.syncDemoLiveEvents("demo_goal");
    expect(countConfirmedGoalsInWindow(db.state.events, DEMO_LIVE_WINDOW)).toBe(1);
    db.state.events = [];
    db.syncDemoLiveEvents("demo_cancelled_goal");
    expect(countConfirmedGoalsInWindow(db.state.events, DEMO_LIVE_WINDOW)).toBe(0);
  });

  test("requires verified live event comparison before proposing result", () => {
    const db = new InMemoryDb();
    const window = db.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 });
    const market = db.createMarket(window.id);
    expect(() => db.proposeResult(market.id, "demo://fixture/demo-2026-001/events")).toThrow("Live event data must be verified");
    db.syncDemoLiveEvents("demo_goal");
    db.compareLiveEvents(DEMO_FIXTURE_ID, 3780, 4380);
    const proposal = db.proposeResult(market.id, "demo://fixture/demo-2026-001/events");
    expect(proposal.winningOutcome).toBe(0);
    expect(proposal.goalCountInWindow).toBe(1);
  });

  test("returns existing windows and surfaces not found errors", () => {
    const db = new InMemoryDb();
    const first = db.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 });
    const second = db.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 });
    expect(second.id).toBe(first.id);
    expect(db.listFixtures("scheduled")).toEqual([]);
    expect(db.listLiveWindows("live_trading").length).toBe(1);
    expect(() => db.createLiveWindow({ fixtureId: "missing", startMatchSecond: 0, endMatchSecond: 600 })).toThrow("Fixture not found");
    expect(() => db.createMarket("missing-window")).toThrow("Live window not found");
    expect(() => db.injectFixtureMismatch("missing", "venue", "Wrong")).toThrow("Fixture not found");
  });


  test("creates distinct live windows and enforces challenge deadline before finalize", () => {
    const db = new InMemoryDb();
    const first = db.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 });
    const second = db.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 4380, endMatchSecond: 4980 });
    expect(first.id).not.toBe(second.id);
    expect(second.windowKey).toContain("4380:4980");

    const market = db.createMarket(first.id);
    db.syncDemoLiveEvents("demo_goal");
    db.compareLiveEvents(DEMO_FIXTURE_ID, 3780, 4380);
    const proposal = db.proposeResult(market.id, "demo://events", new Date("2026-06-13T22:15:00.000Z"));
    expect(() => db.finalizeResult(market.id, new Date("2026-06-13T22:16:00.000Z"))).toThrow("Challenge window is still open");
    expect(db.finalizeResult(market.id, new Date(proposal.challengeDeadline)).status).toBe("finalized");
  });

  test("does not reuse the demo live-window id for another fixture with the same seconds", () => {
    const db = new InMemoryDb();
    const fixture = { ...DEMO_FIXTURE, id: "fixture:other", fifaMatchId: "other-001", homeTeam: "France", awayTeam: "Japan" };
    db.state.fixtures.push(fixture);
    db.state.snapshots.push(makeSnapshot("fixture:fixture:other", "fifa_official", fixture, "2026-06-13T22:03:00.000Z"));
    db.state.snapshots.push(makeSnapshot("fixture:fixture:other", "sports_data_provider", fixture, "2026-06-13T22:03:00.000Z"));
    db.upsertComparison(makeFixtureComparison(fixture, fixture));
    const liveWindow = db.createLiveWindow({ fixtureId: fixture.id, startMatchSecond: 3780, endMatchSecond: 4380 });
    expect(liveWindow.id).not.toBe("live-window-demo-63-73");
    expect(db.createMarket(liveWindow.id).id).toBe("market:fixture:other:3780:4380");
  });

  test("challenge marks proposal challenged and blocks automatic finalize", () => {
    const db = new InMemoryDb();
    const liveWindow = db.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 });
    const market = db.createMarket(liveWindow.id);
    db.syncDemoLiveEvents("demo_goal");
    db.compareLiveEvents(DEMO_FIXTURE_ID, 3780, 4380);
    const proposal = db.proposeResult(market.id, "demo://events", new Date("2026-06-13T22:15:00.000Z"));
    const challenge = db.createChallenge({ resultProposalId: proposal.id, challengerAddress: "0x0000000000000000000000000000000000000bbb", reason: "provider mismatch", evidenceUri: "ipfs://challenge", bondAmountRaw: "100" }, new Date("2026-06-13T22:16:00.000Z"));
    expect(challenge.status).toBe("open");
    expect(proposal.status).toBe("challenged");
    expect(db.getMarket(market.id)?.oracleState).toBe("challenged");
    expect(() => db.finalizeResult(market.id, new Date("2026-06-13T22:30:00.000Z"))).toThrow("Challenged proposal cannot be finalized automatically");
  });

  test("rejects challenges after the challenge deadline", () => {
    const db = new InMemoryDb();
    const liveWindow = db.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 });
    const market = db.createMarket(liveWindow.id);
    db.syncDemoLiveEvents("demo_goal");
    db.compareLiveEvents(DEMO_FIXTURE_ID, 3780, 4380);
    const proposal = db.proposeResult(market.id, "demo://events", new Date("2026-06-13T22:15:00.000Z"));
    expect(() => db.createChallenge({ resultProposalId: proposal.id, challengerAddress: "0x0000000000000000000000000000000000000bbb", reason: "late", evidenceUri: "ipfs://late", bondAmountRaw: "100" }, new Date("2026-06-13T22:30:00.000Z"))).toThrow("Challenge window is closed");
  });

  test("recomputes fixture comparison from source snapshots", () => {
    const db = new InMemoryDb();
    const provider = db.state.snapshots.find((snapshot) => snapshot.source === "sports_data_provider" && snapshot.subjectKey === `fixture:${DEMO_FIXTURE_ID}`)!;
    provider.payload = { ...(provider.payload as Record<string, unknown>), venue: "Wrong Stadium" };
    provider.payloadHash = "sha256:changed";
    const comparison = db.compareFixtureData(DEMO_FIXTURE_ID);
    expect(comparison.status).toBe("data_review_required");
    expect(comparison.mismatches.some((mismatch) => mismatch.field === "venue")).toBe(true);
  });

});
