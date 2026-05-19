import { describe, expect, test } from "bun:test";
import { InMemoryDb } from "@polygoal/db";
import { createApiApp } from "../src/app";
import { createAppContext } from "../src/services/app-context";
import { openApiSpec } from "../src/openapi/spec";

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describe("product supplement API", () => {
  test("exposes teams, schedule, and market odds deviation", async () => {
    const db = new InMemoryDb();
    const app = createApiApp(createAppContext(db));
    const teams = await json<{ teams: Array<{ name: string }> }>(await app.request("/teams"));
    expect(teams.teams.map((team) => team.name)).toContain("Brazil");

    const schedule = await json<{ fixtures: Array<{ venue: string; kickoffAtUtc: string }> }>(await app.request("/schedule"));
    expect(schedule.fixtures.length).toBeGreaterThan(0);
    expect(schedule.fixtures.every((fixture) => fixture.venue && fixture.venue.length > 0)).toBe(true);

    const windowBody = await json<{ liveWindow: { id: string } }>(await app.request("/admin/live-windows/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId: "demo-2026-001", startMatchSecond: 3780, endMatchSecond: 4380 }) }));
    const marketBody = await json<{ market: { id: string } }>(await app.request("/admin/markets/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ liveWindowId: windowBody.liveWindow.id }) }));
    const odds = await json<{ comparison: { status: string; maxDeviationBps: number } }>(await app.request("/odds/markets/market-demo-63-73"));
    expect(odds.comparison.status).toBe("verified");
    expect(odds.comparison.maxDeviationBps).toBeLessThanOrEqual(250);
    expect(marketBody.market.id).toBe("market-demo-63-73");

    const unknownOdds = await app.request("/odds/markets/missing-market");
    expect(unknownOdds.status).toBe(404);
    expect(db.state.oddsComparisons).toHaveLength(1);
    expect(openApiSpec.paths["/teams"]).toBeDefined();
    expect(openApiSpec.paths["/schedule"]).toBeDefined();
    expect(openApiSpec.paths["/odds/markets/{marketId}"]).toBeDefined();
    expect(openApiSpec.paths["/data-quality/fixtures/{fixtureId}"]).toBeDefined();
    expect(openApiSpec.paths["/admin/data-quality/live-events/compare"]).toBeDefined();
    expect(openApiSpec.paths["/admin/sync/live-events"]).toBeDefined();
  });
});
