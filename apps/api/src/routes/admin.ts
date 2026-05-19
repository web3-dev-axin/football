import type { Hono } from "hono";
import { DEMO_FIXTURE_ID } from "@worldcup/shared";
import type { Fixture } from "@worldcup/shared";
import type { AppContext } from "../services/app-context";

export function registerAdminRoutes(app: Hono, ctx: AppContext): void {
  app.post("/admin/data-quality/fixtures/compare", async (c) => {
    const body = await c.req.json<{ fixtureId?: string }>().catch((): { fixtureId?: string } => ({}));
    const fixtureId = body.fixtureId ?? DEMO_FIXTURE_ID;
    return c.json(await ctx.db.compareFixtureData(fixtureId));
  });

  app.post("/admin/data-quality/fixtures/inject-mismatch", async (c) => {
    const body = await c.req.json<{ fixtureId: string; field: keyof Fixture; providerValue: unknown }>();
    const comparison = await ctx.db.injectFixtureMismatch(body.fixtureId, body.field, body.providerValue);
    return c.json(comparison);
  });

  app.post("/admin/sync/fixtures", async (c) => c.json({ inserted: (await ctx.db.listFixtures()).length, updated: 0 }));

  app.post("/admin/sync/teams", async (c) => {
    const teams = await ctx.db.listTeams();
    return c.json({ inserted: teams.length, updated: 0, teams });
  });

  app.post("/admin/sync/rankings", async (c) => {
    const teams = await ctx.db.listTeams();
    return c.json({ inserted: teams.length, updated: 0, rankings: teams.map((team, index) => ({ teamId: team.id, fifaRank: index + 1, points: 1800 - index * 10 })) });
  });

  app.post("/admin/sync/live-events", async (c) => {
    const body = await c.req.json<{ mode?: "demo_goal" | "demo_no_goal" | "demo_cancelled_goal" }>().catch((): { mode?: "demo_goal" | "demo_no_goal" | "demo_cancelled_goal" } => ({}));
    return c.json(await ctx.db.syncDemoLiveEvents(body.mode ?? "demo_goal"));
  });

  app.post("/admin/data-quality/live-events/compare", async (c) => {
    const body = await c.req.json<{ fixtureId: string; windowStartMatchSecond: number; windowEndMatchSecond: number }>();
    const comparison = await ctx.db.compareLiveEvents(body.fixtureId, body.windowStartMatchSecond, body.windowEndMatchSecond);
    return c.json(comparison);
  });

  app.post("/admin/sync/odds", async (c) => {
    const body = await c.req.json<{ marketId?: string; providerProbabilityBps?: number }>().catch((): { marketId?: string; providerProbabilityBps?: number } => ({}));
    const comparison = await ctx.db.syncDemoMarketOdds(body.marketId, body.providerProbabilityBps);
    return c.json({ inserted: 2, updated: 0, comparison });
  });

  app.post("/admin/odds/compare", async (c) => {
    const body = await c.req.json<{ marketId?: string }>().catch((): { marketId?: string } => ({}));
    const comparison = await ctx.db.getMarketOddsComparison(body.marketId ?? "market-demo-63-73") ?? await ctx.db.syncDemoMarketOdds(body.marketId ?? "market-demo-63-73");
    return c.json({ comparison });
  });

  app.post("/admin/live-windows/create", async (c) => {
    const body = await c.req.json<{ fixtureId: string; startMatchSecond: number; endMatchSecond: number }>();
    const liveWindow = await ctx.db.createLiveWindow({ fixtureId: body.fixtureId, startMatchSecond: body.startMatchSecond, endMatchSecond: body.endMatchSecond });
    return c.json({ liveWindow });
  });

  app.post("/admin/markets/create", async (c) => {
    const body = await c.req.json<{ liveWindowId: string }>();
    const market = await ctx.db.createMarket(body.liveWindowId);
    return c.json({ market });
  });

  app.post("/admin/results/propose", async (c) => {
    const body = await c.req.json<{ marketId: string; evidenceUri: string }>();
    const proposal = await ctx.db.proposeResult(body.marketId, body.evidenceUri);
    return c.json({ proposal });
  });

  app.post("/admin/results/finalize", async (c) => {
    const body = await c.req.json<{ marketId: string; now?: string }>();
    const proposal = await ctx.db.finalizeResult(body.marketId, body.now ? new Date(body.now) : undefined);
    return c.json({ proposal });
  });
}
