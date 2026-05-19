import { describe, expect, test } from "bun:test";
import postgres from "postgres";
import { DEMO_FIXTURE_ID, DEMO_MARKET_ID } from "@polygoal/shared";
import { createApiApp } from "../src/app";
import { createAppContextFromEnv } from "../src/services/app-context";

const databaseUrl = process.env.DATABASE_URL;

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

async function post(app: ReturnType<typeof createApiApp>, path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API app with real Postgres", () => {
  test.skipIf(!databaseUrl)("persists admin market lifecycle across API contexts", async () => {
    const ctx = await createAppContextFromEnv({ DATABASE_URL: databaseUrl!, POSTGRES_RESET: "true" } as unknown as NodeJS.ProcessEnv);
    const app = createApiApp(ctx);

    const windowBody = await json<{ liveWindow: { id: string } }>(await app.request("/admin/live-windows/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 }),
    }));
    const marketBody = await json<{ market: { id: string } }>(await app.request("/admin/markets/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ liveWindowId: windowBody.liveWindow.id }),
    }));

    await app.request("/admin/sync/live-events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID, mode: "demo_goal" }) });
    await app.request("/admin/data-quality/live-events/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId: DEMO_FIXTURE_ID, windowStartMatchSecond: 3780, windowEndMatchSecond: 4380 }) });
    await app.request("/admin/results/propose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marketId: marketBody.market.id, evidenceUri: "demo://api-postgres/events" }) });
    await app.request("/admin/results/finalize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marketId: marketBody.market.id }) });

    const reloadedCtx = await createAppContextFromEnv({ DATABASE_URL: databaseUrl! } as unknown as NodeJS.ProcessEnv);
    const reloadedApp = createApiApp(reloadedCtx);
    const detail = await json<{ market: { status: string; oracleState: string } }>(await reloadedApp.request(`/markets/${marketBody.market.id}`));
    expect(detail.market.status).toBe("redeemable");
    expect(detail.market.oracleState).toBe("finalized");

    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const [row] = await sql<Array<{ status: string; oracleState: string }>>`
        select status, oracle_state as "oracleState"
        from markets
        where id = ${marketBody.market.id}
      `;
      expect(row).toEqual({ status: "redeemable", oracleState: "finalized" });
    } finally {
      await sql.end();
      if ("close" in ctx.db) await ctx.db.close();
      if ("close" in reloadedCtx.db) await reloadedCtx.db.close();
    }
  });

  test.skipIf(!databaseUrl)("persists operator feature flags and audit logs across API contexts", async () => {
    const ctx = await createAppContextFromEnv({ DATABASE_URL: databaseUrl!, POSTGRES_RESET: "true" } as unknown as NodeJS.ProcessEnv);
    const app = createApiApp(ctx);

    const update = await app.request("/admin/feature-flags/enablePublicChallenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true, operatorId: "operator:pg" }),
    });
    expect(update.status).toBe(200);

    const reloadedCtx = await createAppContextFromEnv({ DATABASE_URL: databaseUrl! } as unknown as NodeJS.ProcessEnv);
    const reloadedApp = createApiApp(reloadedCtx);
    const flags = await json<{ featureFlags: { enablePublicChallenge: boolean } }>(await reloadedApp.request("/admin/feature-flags"));
    const audit = await json<{ auditLogs: Array<{ action: string; actorId: string }> }>(await reloadedApp.request("/admin/audit-logs"));

    expect(flags.featureFlags.enablePublicChallenge).toBe(true);
    expect(audit.auditLogs.some((entry) => entry.action === "feature_flag.updated" && entry.actorId === "operator:pg")).toBe(true);

    if ("close" in ctx.db) await ctx.db.close();
    if ("close" in reloadedCtx.db) await reloadedCtx.db.close();
  });

  test.skipIf(!databaseUrl)("round-trips trades, refunds and commercial market definitions", async () => {
    const ctx = await createAppContextFromEnv({ DATABASE_URL: databaseUrl!, POSTGRES_RESET: "true" } as unknown as NodeJS.ProcessEnv);
    const app = createApiApp(ctx);
    const walletAddress = "0x0000000000000000000000000000000000000abc" as const;
    const sql = postgres(databaseUrl!, { max: 1 });

    try {
      const windowBody = await json<{ liveWindow: { id: string } }>(await post(app, "/admin/live-windows/create", {
        fixtureId: DEMO_FIXTURE_ID,
        startMatchSecond: 4500,
        endMatchSecond: 5100,
      }));
      const marketBody = await json<{ market: { id: string } }>(await post(app, "/admin/markets/create", { liveWindowId: windowBody.liveWindow.id }));
      await sql`
        insert into trades (id, market_id, wallet_address, outcome_index, collateral_amount_raw, shares_amount_raw, trade_type)
        values ('trade:pg-portfolio', ${marketBody.market.id}, ${walletAddress}, 0, '250000000', '240000000', 'buy')
      `;

      const commercialResponse = await post(app, "/admin/markets/commercial", {
        fixtureId: DEMO_FIXTURE_ID,
        marketType: "match_winner",
        startMatchSecond: 0,
      });
      expect(commercialResponse.status).toBe(200);
      const refundResponse = await post(app, `/admin/markets/${DEMO_MARKET_ID}/refund`, {
        operatorId: "operator:pg",
        walletAddress,
        reason: "void refund",
      });
      expect(refundResponse.status).toBe(200);

      const reloadedCtx = await createAppContextFromEnv({ DATABASE_URL: databaseUrl! } as unknown as NodeJS.ProcessEnv);
      const reloadedApp = createApiApp(reloadedCtx);
      const portfolio = await json<{ summary: { positionCount: number }; positions: Array<{ walletAddress: string; sharesAmountRaw: string }> }>(await reloadedApp.request(`/portfolio/${walletAddress}`));
      await reloadedCtx.db.listMarkets();

      expect(portfolio.summary.positionCount).toBe(1);
      expect(portfolio.positions[0]).toMatchObject({ walletAddress, sharesAmountRaw: "240000000" });
      expect(reloadedCtx.db.state.refunds.some((refund) => refund.walletAddress === walletAddress && refund.reason === "void refund")).toBe(true);
      expect(reloadedCtx.db.state.commercialMarkets.some((market) => market.marketType === "match_winner" && market.isFeatured)).toBe(true);

      if ("close" in reloadedCtx.db) await reloadedCtx.db.close();
    } finally {
      await sql.end();
      if ("close" in ctx.db) await ctx.db.close();
    }
  });
});
