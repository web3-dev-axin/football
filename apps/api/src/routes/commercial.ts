import type { Hono } from "hono";
import type { AppContext } from "../services/app-context";
import { requireOperator } from "../services/operator-service";
import { evaluateOrderRisk } from "../services/risk-service";
import { providerHealthRequiresPause } from "../services/provider-health-service";
import { listCommercialMarketTypes } from "../services/market-type-service";
import { listAuditLogs } from "../services/audit-service";
import type { CommercialFeatureFlags, CommercialMarketType, RiskLimitScope, ProviderHealthStatus } from "@polygoal/shared";

export function registerCommercialRoutes(app: Hono, ctx: AppContext): void {
  app.get("/market-types", (c) => c.json({ marketTypes: listCommercialMarketTypes() }));

  app.get("/admin/feature-flags", async (c) => c.json({ featureFlags: await ctx.db.getFeatureFlags() }));
  app.post("/admin/feature-flags/:flag", async (c) => {
    const body = await c.req.json<{ enabled: boolean; operatorId?: string }>();
    const operatorId = requireOperator(body.operatorId);
    const flags = await ctx.db.setFeatureFlag(c.req.param("flag") as keyof CommercialFeatureFlags, body.enabled, operatorId);
    return c.json({ featureFlags: flags });
  });

  app.post("/admin/risk/limits", async (c) => {
    const body = await c.req.json<{ scope: RiskLimitScope; subjectId: string; maxOrderAmountRaw: string; maxUserExposureRaw: string; maxMarketVolumeRaw: string; enabled: boolean }>();
    return c.json({ riskLimit: await ctx.db.upsertRiskLimit(body) });
  });

  app.post("/admin/provider-health", async (c) => {
    const body = await c.req.json<{ provider: "provider_a" | "provider_b" | "fifa_official" | "sports_data_provider"; status: ProviderHealthStatus; latencyMs: number; lastUpdateAgeSeconds: number; details?: Record<string, unknown> }>();
    return c.json({ providerHealth: await ctx.db.recordProviderHealth({ ...body, details: body.details ?? {} }) });
  });

  app.post("/admin/provider-health/auto-pause", async (c) => {
    const body = await c.req.json<{ marketId: string; provider: "provider_a" | "provider_b" | "fifa_official" | "sports_data_provider"; status: ProviderHealthStatus; latencyMs: number; lastUpdateAgeSeconds: number; details?: Record<string, unknown> }>();
    const providerHealth = await ctx.db.recordProviderHealth({ provider: body.provider, status: body.status, latencyMs: body.latencyMs, lastUpdateAgeSeconds: body.lastUpdateAgeSeconds, details: body.details ?? {} });
    const pause = providerHealthRequiresPause([providerHealth]) ? await ctx.db.autoPauseMarketForProviderDelay(body.marketId, `${body.provider} ${body.status}`) : undefined;
    return c.json({ providerHealth, pause });
  });

  app.post("/risk/check", async (c) => {
    const body = await c.req.json<{ marketId: string; userExposureRaw: string; marketVolumeRaw: string; orderAmountRaw: string }>();
    const limit = await ctx.db.getRiskLimit("market", body.marketId) ?? await ctx.db.getRiskLimit("global", "global");
    return c.json({ decision: evaluateOrderRisk({ userExposureRaw: body.userExposureRaw, marketVolumeRaw: body.marketVolumeRaw, orderAmountRaw: body.orderAmountRaw, limit }) });
  });

  app.post("/admin/markets/commercial", async (c) => {
    const body = await c.req.json<{ fixtureId: string; marketType: CommercialMarketType; startMatchSecond: number; endMatchSecond?: number }>();
    return c.json({ commercialMarket: await ctx.db.createCommercialLiveWindow(body) });
  });

  app.post("/admin/markets/:marketId/pause", async (c) => {
    const body = await c.req.json<{ operatorId?: string; reason: string }>();
    const operatorId = requireOperator(body.operatorId);
    return c.json({ pause: await ctx.db.pauseMarket(c.req.param("marketId"), operatorId, body.reason) });
  });

  app.post("/admin/markets/:marketId/resume", async (c) => {
    const body = await c.req.json<{ operatorId?: string; reason: string }>();
    const operatorId = requireOperator(body.operatorId);
    return c.json({ pause: await ctx.db.resumeMarket(c.req.param("marketId"), operatorId, body.reason) });
  });

  app.post("/admin/challenges", async (c) => {
    const body = await c.req.json<{ resultProposalId: string; challengerAddress: `0x${string}`; reason: string; evidenceUri: string; bondAmountRaw: string }>();
    return c.json({ challenge: await ctx.db.createChallenge(body) });
  });

  app.post("/admin/challenges/:challengeId/review", async (c) => {
    const body = await c.req.json<{ operatorId?: string; status: "accepted" | "rejected"; reviewNote: string }>();
    const operatorId = requireOperator(body.operatorId);
    return c.json({ challenge: await ctx.db.reviewChallenge(c.req.param("challengeId"), operatorId, body.status, body.reviewNote) });
  });

  app.post("/admin/markets/:marketId/void", async (c) => {
    const body = await c.req.json<{ operatorId?: string; reason: string }>();
    const operatorId = requireOperator(body.operatorId);
    return c.json({ market: await ctx.db.voidMarketByOperator(c.req.param("marketId"), operatorId, body.reason) });
  });

  app.post("/admin/markets/:marketId/refund", async (c) => {
    const body = await c.req.json<{ operatorId?: string; walletAddress: `0x${string}`; reason: string }>();
    const operatorId = requireOperator(body.operatorId);
    return c.json({ refund: await ctx.db.queueRefund(c.req.param("marketId"), operatorId, body.walletAddress, body.reason) });
  });

  app.get("/admin/audit-logs", async (c) => {
    await ctx.db.listMarkets();
    return c.json({ auditLogs: listAuditLogs(ctx.db) });
  });

  app.get("/portfolio/:walletAddress", async (c) => {
    const walletAddress = c.req.param("walletAddress") as `0x${string}`;
    // Prefer the Ponder indexer (real on-chain trades) when it has data for
    // this wallet. Only fall through to the in-memory / demo seed data when
    // the indexer is unavailable or genuinely has nothing for this address,
    // so that stale `/admin/portfolio/seed-position` seeds don't bloat real
    // portfolios.
    if (ctx.ponder) {
      const onchain = await ctx.ponder.listTradesForWallet(walletAddress);
      if (onchain.length > 0) {
        return c.json({ positions: onchain, summary: { walletAddress, positionCount: onchain.length } });
      }
    }
    await ctx.db.listMarkets();
    const positions = ctx.db.state.trades.filter(
      (trade) => trade.walletAddress.toLowerCase() === walletAddress.toLowerCase(),
    );
    return c.json({ positions, summary: { walletAddress, positionCount: positions.length } });
  });
}
