import type { Hono } from "hono";
import type { AppContext } from "../services/app-context";
import { ApiError } from "../services/errors";

export function registerPublicRoutes(app: Hono, ctx: AppContext): void {
  app.get("/teams", async (c) => c.json({ teams: await ctx.db.listTeams() }));

  app.get("/schedule", async (c) => c.json({ fixtures: await ctx.db.listSchedule() }));

  app.get("/fixtures", async (c) => {
    const status = c.req.query("status");
    return c.json({ fixtures: await ctx.db.listFixtures(status) });
  });

  app.get("/data-quality/fixtures/:fixtureId", async (c) => {
    const fixtureId = c.req.param("fixtureId");
    const comparison = await ctx.db.getComparison("fixture", `fixture:${fixtureId}`);
    if (!comparison) throw new ApiError("DATA_QUALITY_NOT_FOUND", "Fixture comparison not found", 404);
    return c.json({
      fixtureId,
      status: comparison.status,
      sources: ctx.db.state.snapshots.filter((snapshot) => snapshot.subjectKey === `fixture:${fixtureId}`).map((snapshot) => snapshot.source),
      criticalMismatchCount: comparison.criticalMismatchCount,
      warnings: comparison.warnings,
      mismatches: comparison.mismatches,
    });
  });

  app.get("/live-windows", async (c) => {
    const status = c.req.query("status");
    return c.json({ liveWindows: await ctx.db.listLiveWindows(status) });
  });

  app.get("/markets", async (c) => {
    const status = c.req.query("status");
    return c.json({ markets: await ctx.db.listMarkets(status) });
  });

  app.get("/markets/:marketId", async (c) => {
    const market = await ctx.db.getMarket(c.req.param("marketId"));
    if (!market) throw new ApiError("MARKET_NOT_FOUND", "Market not found", 404);
    const sourceComparison = await ctx.db.getComparison("fixture", `fixture:${market.fixture.fifaMatchId}`);
    const oddsComparison = await ctx.db.getMarketOddsComparison(market.id);
    return c.json({ market: { ...market, sourceComparison, oddsComparison } });
  });

  app.get("/odds/markets/:marketId", async (c) => {
    const marketId = c.req.param("marketId");
    const market = await ctx.db.getMarket(marketId);
    if (!market) throw new ApiError("MARKET_NOT_FOUND", "Market not found", 404);
    const comparison = await ctx.db.getMarketOddsComparison(market.id);
    if (!comparison) throw new ApiError("ODDS_NOT_FOUND", "Odds comparison not found", 404);
    return c.json({ comparison, snapshots: ctx.db.state.oddsSnapshots.filter((snapshot) => snapshot.marketId === market.id) });
  });

  app.get("/odds/fixtures/:fixtureId", async (c) => {
    const fixtureId = c.req.param("fixtureId");
    const markets = await ctx.db.listMarkets();
    const marketIds = new Set(markets.filter((market) => market.fixture.id === fixtureId || market.fixture.fifaMatchId === fixtureId).map((market) => market.id));
    const comparisons = ctx.db.state.oddsComparisons.filter((comparison) => marketIds.has(comparison.marketId));
    return c.json({ fixtureId, comparisons });
  });

  app.get("/settlements", async (c) => {
    const status = c.req.query("status");
    await ctx.db.listMarkets();
    const settlements = ctx.db.state.proposals.filter((proposal) => !status || proposal.status === status);
    return c.json({ settlements });
  });
}
