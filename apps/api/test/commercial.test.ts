import { describe, expect, test } from "bun:test";
import { InMemoryDb } from "@polygoal/db";
import {
  DEMO_FIXTURE_ID,
  WORLDCUP_2026_GROUP_STAGE_FIXTURES,
  WORLDCUP_2026_GROUP_STAGE_MATCH_COUNT,
} from "@polygoal/shared";
import { createApiApp } from "../src/app";
import { createAppContext } from "../src/services/app-context";

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describe("commercial API", () => {
  test("exposes market matrix, feature flags, risk limits, operator pause/resume and audit logs", async () => {
    const app = createApiApp(createAppContext(new InMemoryDb()));

    const matrix = await json<{ marketTypes: Array<{ marketType: string; enabledByDefault: boolean }> }>(await app.request("/market-types"));
    expect(matrix.marketTypes.map((market) => market.marketType)).toEqual(["match_winner", "exact_score"]);
    expect(matrix.marketTypes.find((market) => market.marketType === "match_winner")?.enabledByDefault).toBe(true);

    const flags = await json<{ featureFlags: { enableMatchWinnerMarket: boolean } }>(await app.request("/admin/feature-flags"));
    expect(flags.featureFlags.enableMatchWinnerMarket).toBe(true);
    await app.request("/admin/feature-flags/enableGeoBlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: true, operatorId: "operator-1" }) });
    const updatedFlags = await json<{ featureFlags: { enableGeoBlock: boolean } }>(await app.request("/admin/feature-flags"));
    expect(updatedFlags.featureFlags.enableGeoBlock).toBe(true);

    const riskResponse = await app.request("/admin/risk/limits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "market", subjectId: "market-demo-63-73", maxOrderAmountRaw: "1000", maxUserExposureRaw: "2000", maxMarketVolumeRaw: "3000", enabled: true }) });
    expect(riskResponse.status).toBe(200);

    const provider = await json<{ providerHealth: { status: string } }>(await app.request("/admin/provider-health", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "provider_a", status: "healthy", latencyMs: 100, lastUpdateAgeSeconds: 1 }) }));
    expect(provider.providerHealth.status).toBe("healthy");

    const allowedRisk = await json<{ decision: { allowed: boolean } }>(await app.request("/risk/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marketId: "unknown", userExposureRaw: "0", marketVolumeRaw: "0", orderAmountRaw: "1" }) }));
    expect(allowedRisk.decision.allowed).toBe(true);

    const winnerMarket = await json<{ commercialMarket: { id: string; marketType: string; outcomes: Array<{ label: string }> } }>(await app.request("/admin/markets/commercial", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID, marketType: "match_winner", startMatchSecond: 0 }) }));
    expect(winnerMarket.commercialMarket.marketType).toBe("match_winner");
    expect(winnerMarket.commercialMarket.outcomes.map((outcome) => outcome.label)).toEqual(["Brazil", "Draw", "Morocco"]);

    const pause = await json<{ pause: { status: string } }>(await app.request("/admin/markets/market-demo-63-73/pause", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operatorId: "operator-1", reason: "provider delayed" }) }));
    expect(pause.pause.status).toBe("active");
    const resume = await json<{ pause: { status: string } }>(await app.request("/admin/markets/market-demo-63-73/resume", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operatorId: "operator-1", reason: "provider recovered" }) }));
    expect(resume.pause.status).toBe("resolved");

    const audit = await json<{ auditLogs: Array<{ action: string }> }>(await app.request("/admin/audit-logs"));
    expect(audit.auditLogs.map((entry) => entry.action)).toContain("market.paused");
  });

  test("blocks unauthorized operator requests and exposes portfolio summary", async () => {
    const app = createApiApp(createAppContext(new InMemoryDb()));
    const unauthorized = await app.request("/admin/markets/market-demo-63-73/pause", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operatorId: "", reason: "bad" }) });
    expect(unauthorized.status).toBe(401);
    const portfolio = await json<{ positions: unknown[]; summary: { walletAddress: string } }>(await app.request("/portfolio/0x0000000000000000000000000000000000000aaa"));
    expect(portfolio.summary.walletAddress).toBe("0x0000000000000000000000000000000000000aaa");
  });

  test("lists bootstrapped commercial pools for every group stage fixture", async () => {
    const app = createApiApp(createAppContext(new InMemoryDb()));

    const all = await json<{ commercialMarkets: Array<{ fixtureId: string; marketType: string }> }>(
      await app.request("/commercial-markets"),
    );
    expect(all.commercialMarkets.length).toBe(WORLDCUP_2026_GROUP_STAGE_MATCH_COUNT * 2);

    const matchWinners = await json<{ commercialMarkets: Array<{ marketType: string }> }>(
      await app.request("/commercial-markets?marketType=match_winner"),
    );
    expect(matchWinners.commercialMarkets.length).toBe(WORLDCUP_2026_GROUP_STAGE_MATCH_COUNT);
    expect(matchWinners.commercialMarkets.every((market) => market.marketType === "match_winner")).toBe(true);

    const exactScores = await json<{ commercialMarkets: Array<{ marketType: string }> }>(
      await app.request("/commercial-markets?marketType=exact_score"),
    );
    expect(exactScores.commercialMarkets.length).toBe(WORLDCUP_2026_GROUP_STAGE_MATCH_COUNT);

    const fixtureId = WORLDCUP_2026_GROUP_STAGE_FIXTURES[5]?.id;
    if (!fixtureId) throw new Error("expected at least 6 group stage fixtures");
    const perFixture = await json<{ commercialMarkets: Array<{ fixtureId: string; marketType: string }> }>(
      await app.request(`/commercial-markets?fixtureId=${encodeURIComponent(fixtureId)}`),
    );
    expect(perFixture.commercialMarkets.map((market) => market.marketType).sort()).toEqual(["exact_score", "match_winner"]);
    expect(perFixture.commercialMarkets.every((market) => market.fixtureId === fixtureId)).toBe(true);
  });

  test("admin bootstrap endpoint is idempotent", async () => {
    const app = createApiApp(createAppContext(new InMemoryDb()));
    const response = await app.request("/admin/markets/bootstrap-schedule", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(response.status).toBe(200);
    const body = await json<{ summary: { fixturesCount: number; matchWinnerCreated: number; exactScoreCreated: number; totalPools: number } }>(response);
    expect(body.summary.fixturesCount).toBe(WORLDCUP_2026_GROUP_STAGE_MATCH_COUNT);
    expect(body.summary.matchWinnerCreated).toBe(0);
    expect(body.summary.exactScoreCreated).toBe(0);
    expect(body.summary.totalPools).toBe(WORLDCUP_2026_GROUP_STAGE_MATCH_COUNT * 2);
  });

  test("commercial markets carry human-readable resolutionRule details", async () => {
    const app = createApiApp(createAppContext(new InMemoryDb()));
    const body = await json<{ commercialMarkets: Array<{ marketType: string; resolutionPolicy: string; resolutionRule?: { humanText: string; bullets: string[]; challengeWindowSeconds: number } }> }>(
      await app.request(`/commercial-markets?fixtureId=${encodeURIComponent(DEMO_FIXTURE_ID)}`),
    );
    const matchWinner = body.commercialMarkets.find((m) => m.marketType === "match_winner");
    const exactScore = body.commercialMarkets.find((m) => m.marketType === "exact_score");
    expect(matchWinner?.resolutionRule?.humanText).toContain("90 minutes");
    expect(matchWinner?.resolutionRule?.bullets?.length).toBeGreaterThan(0);
    expect(matchWinner?.resolutionRule?.challengeWindowSeconds).toBeGreaterThan(0);
    expect(exactScore?.resolutionRule?.humanText).toContain("Other score");
  });

  test("GET /fixtures/:fixtureId/events lists match events sorted by matchSecond", async () => {
    const db = new InMemoryDb();
    const app = createApiApp(createAppContext(db));
    const empty = await json<{ events: unknown[] }>(await app.request(`/fixtures/${DEMO_FIXTURE_ID}/events`));
    expect(empty.events).toEqual([]);

    await app.request("/admin/sync/live-events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID, mode: "demo_goal" }) });
    const withGoal = await json<{ events: Array<{ eventType: string }> }>(await app.request(`/fixtures/${DEMO_FIXTURE_ID}/events`));
    expect(withGoal.events.length).toBe(1);
    expect(withGoal.events[0]?.eventType).toBe("goal");

    const missing = await app.request("/fixtures/does-not-exist/events");
    expect(missing.status).toBe(404);
  });
});
