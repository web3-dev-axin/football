import { describe, expect, test } from "bun:test";
import { InMemoryDb } from "@worldcup/db";
import { DEMO_FIXTURE_ID } from "@worldcup/shared";
import { createApiApp } from "../src/app";
import { createAppContext } from "../src/services/app-context";

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describe("commercial API", () => {
  test("exposes market matrix, feature flags, risk limits, operator pause/resume and audit logs", async () => {
    const app = createApiApp(createAppContext(new InMemoryDb()));

    const matrix = await json<{ marketTypes: Array<{ marketType: string; enabledByDefault: boolean }> }>(await app.request("/market-types"));
    expect(matrix.marketTypes.some((market) => market.marketType === "goal_window_5m")).toBe(true);
    expect(matrix.marketTypes.find((market) => market.marketType === "next_corner_team")?.enabledByDefault).toBe(false);

    const flags = await json<{ featureFlags: { enableNextGoalMarket: boolean } }>(await app.request("/admin/feature-flags"));
    expect(flags.featureFlags.enableNextGoalMarket).toBe(true);
    await app.request("/admin/feature-flags/enableGeoBlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: true, operatorId: "operator-1" }) });
    const updatedFlags = await json<{ featureFlags: { enableGeoBlock: boolean } }>(await app.request("/admin/feature-flags"));
    expect(updatedFlags.featureFlags.enableGeoBlock).toBe(true);

    const riskResponse = await app.request("/admin/risk/limits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "market", subjectId: "market-demo-63-73", maxOrderAmountRaw: "1000", maxUserExposureRaw: "2000", maxMarketVolumeRaw: "3000", enabled: true }) });
    expect(riskResponse.status).toBe(200);

    const provider = await json<{ providerHealth: { status: string } }>(await app.request("/admin/provider-health", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "provider_a", status: "healthy", latencyMs: 100, lastUpdateAgeSeconds: 1 }) }));
    expect(provider.providerHealth.status).toBe("healthy");

    const allowedRisk = await json<{ decision: { allowed: boolean } }>(await app.request("/risk/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marketId: "unknown", userExposureRaw: "0", marketVolumeRaw: "0", orderAmountRaw: "1" }) }));
    expect(allowedRisk.decision.allowed).toBe(true);

    const marketWindow = await json<{ commercialMarket: { id: string; marketType: string; outcomes: Array<{ label: string }> } }>(await app.request("/admin/markets/commercial-window", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID, marketType: "next_goal_team", startMatchSecond: 3780, endMatchSecond: 5400 }) }));
    expect(marketWindow.commercialMarket.marketType).toBe("next_goal_team");
    expect(marketWindow.commercialMarket.outcomes).toHaveLength(3);

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
});
