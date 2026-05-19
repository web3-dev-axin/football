import type { Hono } from "hono";
import type { CommercialMarketDefinition, Fixture, Market, MarketStatus, ResultProposal } from "@polygoal/shared";
import { getXLayerMarketDeployment } from "@polygoal/shared";
import type { AppContext } from "../services/app-context";
import { ApiError } from "../services/errors";

function statusFromFixture(fixture: Fixture): MarketStatus {
  switch (fixture.status) {
    case "live": return "live_trading";
    case "scheduled": return "scheduled";
    case "full_time":
    case "final": return "closed";
    case "cancelled":
    case "abandoned":
    case "postponed": return "voided";
    default: return "scheduled";
  }
}

function commercialOddsSnapshots(commercial: CommercialMarketDefinition): Array<{ source: string; outcomeProbabilitiesBps: number[] }> {
  const bySource = new Map<string, number[]>();
  for (const outcome of commercial.outcomes) {
    const provider = outcome.providerOdds;
    if (!provider) continue;
    const probs = bySource.get(provider.source) ?? new Array(commercial.outcomes.length).fill(0);
    probs[outcome.outcomeIndex] = provider.impliedProbabilityBps;
    bySource.set(provider.source, probs);
  }
  return Array.from(bySource, ([source, outcomeProbabilitiesBps]) => ({ source, outcomeProbabilitiesBps }));
}

function synthesizeMarketFromCommercial(commercial: CommercialMarketDefinition, fixture: Fixture): Market {
  const status = statusFromFixture(fixture);
  const deployment = getXLayerMarketDeployment(commercial.windowKey);
  return {
    id: commercial.id,
    liveWindowId: `${commercial.id}:window`,
    marketKey: commercial.windowKey,
    title: commercial.title,
    status,
    fixture,
    liveWindow: {
      id: `${commercial.id}:window`,
      fixtureId: fixture.id,
      windowKey: commercial.windowKey,
      windowType: "goal_in_next_10_minutes",
      startMatchSecond: commercial.startMatchSecond,
      endMatchSecond: commercial.endMatchSecond,
      tradingCloseMatchSecond: commercial.tradingCloseMatchSecond,
      title: commercial.title,
      status,
      dataQualityStatus: fixture.dataQualityStatus,
    },
    outcomes: commercial.outcomes.map((outcome) => ({
      outcomeIndex: outcome.outcomeIndex,
      label: outcome.label,
      probabilityBps: outcome.probabilityBps,
    })),
    marketAddress: deployment?.marketAddress,
    txHash: deployment?.txHash,
    volumeRaw: "0",
    liquidityRaw: "0",
    oracleState: "none",
    dataQualityStatus: fixture.dataQualityStatus,
  };
}

export function registerPublicRoutes(app: Hono, ctx: AppContext): void {
  app.get("/teams", async (c) => c.json({ teams: await ctx.db.listTeams() }));

  app.get("/schedule", async (c) => c.json({ fixtures: await ctx.db.listSchedule() }));

  app.get("/fixtures", async (c) => {
    const status = c.req.query("status");
    return c.json({ fixtures: await ctx.db.listFixtures(status) });
  });

  app.get("/fixtures/:fixtureId/events", async (c) => {
    const fixtureId = c.req.param("fixtureId");
    const fixture = await ctx.db.getFixture(fixtureId);
    if (!fixture) throw new ApiError("FIXTURE_NOT_FOUND", "Fixture not found", 404);
    const events = await ctx.db.listMatchEvents(fixtureId);
    return c.json({ fixtureId, events });
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

  app.get("/commercial-markets", async (c) => {
    const fixtureId = c.req.query("fixtureId") ?? undefined;
    const rawMarketType = c.req.query("marketType");
    const marketType = rawMarketType === "match_winner" || rawMarketType === "exact_score" ? rawMarketType : undefined;
    const commercialMarkets = await ctx.db.listCommercialMarkets({ fixtureId, marketType });
    return c.json({ commercialMarkets });
  });

  app.get("/markets/:marketId", async (c) => {
    const marketId = c.req.param("marketId");
    const overlay = ctx.ponder ? await ctx.ponder.getMarketStatusOverlay(marketId).catch(() => null) : null;
    const market = await ctx.db.getMarket(marketId);
    if (market) {
      const sourceComparison = await ctx.db.getComparison("fixture", `fixture:${market.fixture.fifaMatchId}`);
      const oddsComparison = await ctx.db.getMarketOddsComparison(market.id);
      const overlaid = overlay
        ? {
            ...market,
            status: overlay.status as typeof market.status,
            oracleState: overlay.oracleState as typeof market.oracleState,
            ...(overlay.winningOutcome !== undefined ? { winningOutcome: overlay.winningOutcome } : {}),
          }
        : market;
      return c.json({ market: { ...overlaid, sourceComparison, oddsComparison } });
    }
    const commercial = await ctx.db.getCommercialMarketById(marketId);
    if (!commercial) throw new ApiError("MARKET_NOT_FOUND", "Market not found", 404);
    const fixture = await ctx.db.getFixture(commercial.fixtureId);
    if (!fixture) throw new ApiError("FIXTURE_NOT_FOUND", "Fixture not found", 404);
    const synthesized = synthesizeMarketFromCommercial(commercial, fixture);
    const overlaid = overlay
      ? {
          ...synthesized,
          status: overlay.status as typeof synthesized.status,
          oracleState: overlay.oracleState as typeof synthesized.oracleState,
          ...(overlay.winningOutcome !== undefined ? { winningOutcome: overlay.winningOutcome } : {}),
        }
      : synthesized;
    return c.json({ market: overlaid });
  });

  app.get("/odds/markets/:marketId", async (c) => {
    const marketId = c.req.param("marketId");
    const market = await ctx.db.getMarket(marketId);
    if (market) {
      const comparison = await ctx.db.getMarketOddsComparison(market.id);
      if (!comparison) throw new ApiError("ODDS_NOT_FOUND", "Odds comparison not found", 404);
      return c.json({ comparison, snapshots: ctx.db.state.oddsSnapshots.filter((snapshot) => snapshot.marketId === market.id) });
    }
    const commercial = await ctx.db.getCommercialMarketById(marketId);
    if (!commercial) throw new ApiError("MARKET_NOT_FOUND", "Market not found", 404);
    const snapshots = commercialOddsSnapshots(commercial);
    return c.json({
      comparison: { id: `${commercial.id}:comparison`, status: "verified", maxDeviationBps: 0 },
      snapshots,
    });
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
    const inMemory = ctx.db.state.proposals.filter((proposal) => !status || proposal.status === status);
    const onchain = ctx.ponder ? await ctx.ponder.listSettlements(status ?? undefined) : [];
    // Prefer on-chain proposals when both sources have an entry for the same
    // market id (on-chain is authoritative). Demo / admin-seeded proposals fill
    // gaps for markets that haven't produced an on-chain proposal yet.
    const byMarketId = new Map<string, ResultProposal>();
    for (const p of inMemory) byMarketId.set(p.marketId, p);
    for (const p of onchain) byMarketId.set(p.marketId, p);
    return c.json({ settlements: Array.from(byMarketId.values()) });
  });
}
