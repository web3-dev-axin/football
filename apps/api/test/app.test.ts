import { describe, expect, test } from "bun:test";
import { InMemoryDb } from "@worldcup/db";
import { DEMO_FIXTURE_ID } from "@worldcup/shared";
import { createApiApp } from "../src/app";
import { createAppContext } from "../src/services/app-context";

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describe("API app", () => {
  test("GET /health returns ok", async () => {
    const app = createApiApp();
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    expect(await json<{ ok: boolean }>(response)).toEqual({ ok: true });
  });

  test("fixture mismatch blocks live window creation with 409", async () => {
    const app = createApiApp(createAppContext(new InMemoryDb()));
    await app.request("/admin/data-quality/fixtures/inject-mismatch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID, field: "kickoffAtUtc", providerValue: "2026-06-13T22:00:00.000Z" }),
    });
    const response = await app.request("/admin/live-windows/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID, windowType: "goal_in_next_10_minutes", startMatchSecond: 3780, endMatchSecond: 4380 }),
    });
    expect(response.status).toBe(409);
    const body = await json<{ error: { code: string } }>(response);
    expect(body.error.code).toBe("DATA_QUALITY_REVIEW_REQUIRED");
  });

  test("runs demo admin flow from live window through finalize", async () => {
    const app = createApiApp(createAppContext(new InMemoryDb()));
    const windowResponse = await app.request("/admin/live-windows/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID, windowType: "goal_in_next_10_minutes", startMatchSecond: 3780, endMatchSecond: 4380 }),
    });
    expect(windowResponse.status).toBe(200);
    const windowBody = await json<{ liveWindow: { id: string; status: string } }>(windowResponse);
    expect(windowBody.liveWindow.status).toBe("live_trading");

    const marketResponse = await app.request("/admin/markets/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ liveWindowId: windowBody.liveWindow.id }),
    });
    const marketBody = await json<{ market: { id: string; outcomes: Array<{ label: string }> } }>(marketResponse);
    expect(marketBody.market.outcomes.map((outcome) => outcome.label)).toEqual(["Yes", "No"]);

    await app.request("/admin/sync/live-events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID, mode: "demo_goal" }) });
    await app.request("/admin/data-quality/live-events/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID, windowStartMatchSecond: 3780, windowEndMatchSecond: 4380 }) });

    const proposalResponse = await app.request("/admin/results/propose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ marketId: marketBody.market.id, evidenceUri: "demo://fixture/demo-2026-001/events" }),
    });
    const proposalBody = await json<{ proposal: { winningOutcome: number; goalCountInWindow: number } }>(proposalResponse);
    expect(proposalBody.proposal.winningOutcome).toBe(0);
    expect(proposalBody.proposal.goalCountInWindow).toBe(1);

    const finalizeResponse = await app.request("/admin/results/finalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ marketId: marketBody.market.id }),
    });
    expect(finalizeResponse.status).toBe(200);
    const marketDetail = await app.request(`/markets/${marketBody.market.id}`);
    const detailBody = await json<{ market: { status: string; oracleState: string } }>(marketDetail);
    expect(detailBody.market.status).toBe("redeemable");
    expect(detailBody.market.oracleState).toBe("finalized");
  });

  test("result proposal is blocked before live events are verified", async () => {
    const app = createApiApp(createAppContext(new InMemoryDb()));
    const windowResponse = await app.request("/admin/live-windows/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 }) });
    const windowBody = await json<{ liveWindow: { id: string } }>(windowResponse);
    const marketResponse = await app.request("/admin/markets/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ liveWindowId: windowBody.liveWindow.id }) });
    const marketBody = await json<{ market: { id: string } }>(marketResponse);
    const response = await app.request("/admin/results/propose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marketId: marketBody.market.id, evidenceUri: "demo://events" }) });
    expect(response.status).toBe(409);
    expect((await json<{ error: { code: string } }>(response)).error.code).toBe("LIVE_EVENT_REVIEW_REQUIRED");
  });

  test("public routes expose fixtures, data quality, market detail, settlements, docs, and 404 errors", async () => {
    const app = createApiApp(createAppContext(new InMemoryDb()));
    const fixtures = await json<{ fixtures: Array<{ fifaMatchId: string }> }>(await app.request("/fixtures?status=live"));
    expect(fixtures.fixtures[0]?.fifaMatchId).toBe(DEMO_FIXTURE_ID);

    const quality = await json<{ status: string; sources: string[] }>(await app.request(`/data-quality/fixtures/${DEMO_FIXTURE_ID}`));
    expect(quality.status).toBe("verified");
    expect(quality.sources.sort()).toEqual(["fifa_official", "sports_data_provider"]);

    const missingQuality = await app.request("/data-quality/fixtures/missing");
    expect(missingQuality.status).toBe(404);

    const compare = await app.request("/admin/data-quality/fixtures/compare", { method: "POST" });
    expect(compare.status).toBe(200);

    const windowBody = await json<{ liveWindow: { id: string } }>(await app.request("/admin/live-windows/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 }) }));
    const marketBody = await json<{ market: { id: string } }>(await app.request("/admin/markets/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ liveWindowId: windowBody.liveWindow.id }) }));

    const windows = await json<{ liveWindows: unknown[] }>(await app.request("/live-windows?status=live_trading"));
    expect(windows.liveWindows.length).toBe(1);
    const markets = await json<{ markets: unknown[] }>(await app.request("/markets?status=live_trading"));
    expect(markets.markets.length).toBe(1);
    const detail = await json<{ market: { id: string; sourceComparison: { status: string } } }>(await app.request(`/markets/${marketBody.market.id}`));
    expect(detail.market.sourceComparison.status).toBe("verified");
    expect((await app.request("/markets/missing")).status).toBe(404);

    await app.request("/admin/sync/live-events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "demo_no_goal" }) });
    await app.request("/admin/data-quality/live-events/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID, windowStartMatchSecond: 3780, windowEndMatchSecond: 4380 }) });
    await app.request("/admin/results/propose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marketId: marketBody.market.id, evidenceUri: "demo://events" }) });
    const settlements = await json<{ settlements: unknown[] }>(await app.request("/settlements?status=proposed"));
    expect(settlements.settlements.length).toBe(1);

    expect((await app.request("/openapi.json")).status).toBe(200);
    expect((await app.request("/docs")).status).toBe(200);
    expect((await app.request("/unknown")).status).toBe(404);
  });

});
