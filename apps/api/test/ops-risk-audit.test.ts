import { describe, expect, test } from "bun:test";
import { InMemoryDb } from "@polygoal/db";
import { DEMO_FIXTURE_ID } from "@polygoal/shared";
import { createApiApp } from "../src/app";
import { createAppContext } from "../src/services/app-context";

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describe("ops risk audit workflows", () => {
  test("checks risk limits and auto-pauses delayed provider markets", async () => {
    const db = new InMemoryDb();
    const app = createApiApp(createAppContext(db));
    await app.request("/admin/risk/limits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "market", subjectId: "market-demo-63-73", maxOrderAmountRaw: "100", maxUserExposureRaw: "100", maxMarketVolumeRaw: "100", enabled: true }) });

    const risk = await json<{ decision: { allowed: boolean; reason?: string } }>(await app.request("/risk/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marketId: "market-demo-63-73", userExposureRaw: "90", marketVolumeRaw: "0", orderAmountRaw: "20" }) }));
    expect(risk.decision).toEqual({ allowed: false, reason: "USER_LIMIT_EXCEEDED" });

    const health = await json<{ pause?: { status: string } }>(await app.request("/admin/provider-health/auto-pause", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marketId: "market-demo-63-73", provider: "provider_a", status: "delayed", latencyMs: 800, lastUpdateAgeSeconds: 45, details: {} }) }));
    expect(health.pause?.status).toBe("active");
    expect(db.state.auditLogs.at(-1)?.action).toBe("market.paused");
  });

  test("void/refund and challenge review are audited", async () => {
    const db = new InMemoryDb();
    const app = createApiApp(createAppContext(db));
    const liveWindow = db.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 });
    const market = db.createMarket(liveWindow.id);
    db.syncDemoLiveEvents("demo_goal");
    db.compareLiveEvents(DEMO_FIXTURE_ID, 3780, 4380);
    const proposal = db.proposeResult(market.id, "demo://events", new Date("2026-06-13T22:15:00.000Z"));
    const challenge = await json<{ challenge: { status: string } }>(await app.request("/admin/challenges", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resultProposalId: proposal.id, challengerAddress: "0x0000000000000000000000000000000000000bbb", reason: "score mismatch", evidenceUri: "ipfs://evidence", bondAmountRaw: "100" }) }));
    expect(challenge.challenge.status).toBe("open");
    expect((await app.request("/admin/results/finalize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marketId: market.id, now: "2026-06-13T22:30:00.000Z" }) })).status).toBe(409);

    const review = await json<{ challenge: { status: string; reviewedBy: string } }>(await app.request("/admin/challenges/challenge:1/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operatorId: "operator-1", status: "accepted", reviewNote: "official provider agrees" }) }));
    expect(review.challenge.status).toBe("accepted");
    expect(review.challenge.reviewedBy).toBe("operator-1");

    const voided = await json<{ market: { oracleState: string; status: string } }>(await app.request("/admin/markets/market-demo-63-73/void", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operatorId: "operator-1", reason: "critical provider mismatch" }) }));
    expect(voided.market.oracleState).toBe("voided");

    const refund = await json<{ refund: { marketId: string; status: string } }>(await app.request("/admin/markets/market-demo-63-73/refund", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operatorId: "operator-1", walletAddress: "0x0000000000000000000000000000000000000bbb", reason: "voided" }) }));
    expect(refund.refund.status).toBe("queued");
    expect(db.state.auditLogs.map((log) => log.action)).toContain("market.refund_queued");
  });
});
