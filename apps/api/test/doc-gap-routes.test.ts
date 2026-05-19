import { describe, expect, test } from "bun:test";
import { InMemoryDb } from "@worldcup/db";
import { DEMO_FIXTURE_ID } from "@worldcup/shared";
import { createApiApp } from "../src/app";
import { createAppContext } from "../src/services/app-context";
import { openApiSpec } from "../src/openapi/spec";

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describe("documented gap routes", () => {
  test("admin fixture compare recomputes source snapshots", async () => {
    const db = new InMemoryDb();
    const app = createApiApp(createAppContext(db));
    const provider = db.state.snapshots.find((snapshot) => snapshot.source === "sports_data_provider" && snapshot.subjectKey === `fixture:${DEMO_FIXTURE_ID}`)!;
    provider.payload = { ...(provider.payload as Record<string, unknown>), kickoffAtUtc: "2026-06-13T23:00:00.000Z" };
    const response = await app.request("/admin/data-quality/fixtures/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID }) });
    const comparison = await json<{ status: string; criticalMismatchCount: number }>(response);
    expect(comparison.status).toBe("data_review_required");
    expect(comparison.criticalMismatchCount).toBeGreaterThan(0);
  });

  test("finalize route rejects open challenge window and accepts explicit later time", async () => {
    const app = createApiApp(createAppContext(new InMemoryDb()));
    const windowBody = await json<{ liveWindow: { id: string } }>(await app.request("/admin/live-windows/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 }) }));
    const marketBody = await json<{ market: { id: string } }>(await app.request("/admin/markets/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ liveWindowId: windowBody.liveWindow.id }) }));
    await app.request("/admin/sync/live-events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "demo_goal" }) });
    await app.request("/admin/data-quality/live-events/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID, windowStartMatchSecond: 3780, windowEndMatchSecond: 4380 }) });
    const proposal = await json<{ proposal: { challengeDeadline: string } }>(await app.request("/admin/results/propose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marketId: marketBody.market.id, evidenceUri: "demo://events" }) }));
    expect((await app.request("/admin/results/finalize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marketId: marketBody.market.id, now: "2026-06-13T22:16:00.000Z" }) })).status).toBe(409);
    expect((await app.request("/admin/results/finalize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marketId: marketBody.market.id, now: proposal.proposal.challengeDeadline }) })).status).toBe(200);
  });

  test("sync teams rankings odds and fixture odds routes are documented", async () => {
    const db = new InMemoryDb();
    const app = createApiApp(createAppContext(db));
    const liveWindow = db.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 });
    db.createMarket(liveWindow.id);
    expect((await app.request("/admin/sync/teams", { method: "POST" })).status).toBe(200);
    expect((await app.request("/admin/sync/rankings", { method: "POST" })).status).toBe(200);
    expect((await app.request("/admin/sync/odds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marketId: "market-demo-63-73", providerProbabilityBps: 5100 }) })).status).toBe(200);
    expect((await app.request("/admin/sync/odds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marketId: "market-unknown", providerProbabilityBps: 5100 }) })).status).toBe(404);
    expect((await app.request("/admin/odds/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marketId: "market-demo-63-73" }) })).status).toBe(200);
    const fixtureOdds = await json<{ comparisons: unknown[] }>(await app.request(`/odds/fixtures/${DEMO_FIXTURE_ID}`));
    expect(fixtureOdds.comparisons.length).toBeGreaterThan(0);
    for (const path of ["/admin/sync/teams", "/admin/sync/rankings", "/admin/sync/odds", "/admin/odds/compare", "/odds/fixtures/{fixtureId}"] as const) {
      expect(openApiSpec.paths[path]).toBeDefined();
    }
  });
});
