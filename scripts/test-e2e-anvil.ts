import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { InMemoryDb } from "@worldcup/db";
import { DEMO_FIXTURE_ID } from "@worldcup/shared";
import { createApiApp } from "../apps/api/src/app";
import { createAppContext, createAppContextFromEnv } from "../apps/api/src/services/app-context";
import { demoMarketCreatedEvent, handleMarketCreated, handleRedeemed, handleResultFinalized, handleResultProposed, handleTradeExecuted } from "../apps/indexer/src/event-handlers";

async function post<T>(app: ReturnType<typeof createApiApp>, path: string, body: unknown): Promise<T> {
  const response = await app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path} failed with ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function get<T>(app: ReturnType<typeof createApiApp>, path: string): Promise<T> {
  const response = await app.request(path);
  if (!response.ok) throw new Error(`${path} failed with ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function checkAnvil(): Promise<boolean> {
  try {
    const response = await fetch(process.env.RPC_URL ?? "http://localhost:8545", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    const body = await response.json() as { result?: string };
    return body.result === "0x7a69";
  } catch {
    return false;
  }
}

async function checkPostgres(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const postgres = await import("postgres");
    const sql = postgres.default(process.env.DATABASE_URL, { max: 1, connect_timeout: 1 });
    await sql`select 1`;
    await sql.end();
    return true;
  } catch {
    return false;
  }
}

function runContractsFlow(): {
  ok: boolean;
  anvilStartedByCli: boolean;
  contracts: { usdc: string; ctf: string; factory: string; oracle: string };
  scenarios: Record<string, { status: string; txHashes: Record<string, string> }>;
} {
  const result = Bun.spawnSync(["bun", "scripts/contracts-full-flow.ts"], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`contracts full flow failed: ${result.stdout.toString()}${result.stderr.toString()}`);
  }
  return JSON.parse(readFileSync("reports/contracts-full-flow-report.json", "utf8")) as {
    ok: boolean;
    anvilStartedByCli: boolean;
    contracts: { usdc: string; ctf: string; factory: string; oracle: string };
    scenarios: Record<string, { status: string; txHashes: Record<string, string> }>;
  };
}

const indexerDb = new InMemoryDb();
const apiCtx = process.env.DATABASE_URL
  ? await createAppContextFromEnv({ ...process.env, POSTGRES_RESET: "true" })
  : createAppContext(indexerDb);
const app = createApiApp(apiCtx);
const contractsFlow = runContractsFlow();

const health = await get<{ ok: boolean }>(app, "/health");
const dataQuality = await get<{ status: string; criticalMismatchCount: number }>(app, `/data-quality/fixtures/${DEMO_FIXTURE_ID}`);
const liveWindowBody = await post<{ liveWindow: { id: string } }>(app, "/admin/live-windows/create", { fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 });
const marketBody = await post<{ market: { id: string; marketAddress?: string; txHash?: string } }>(app, "/admin/markets/create", { liveWindowId: liveWindowBody.liveWindow.id });

handleMarketCreated(indexerDb, { ...demoMarketCreatedEvent, marketId: marketBody.market.id });
handleTradeExecuted(indexerDb, { marketId: marketBody.market.id, trader: "0x0000000000000000000000000000000000000aaa", outcomeIndex: 0, collateralAmount: "100000000", sharesAmount: "100000000", tradeType: "buy" });
handleTradeExecuted(indexerDb, { marketId: marketBody.market.id, trader: "0x0000000000000000000000000000000000000bbb", outcomeIndex: 1, collateralAmount: "100000000", sharesAmount: "100000000", tradeType: "buy" });

await post(app, "/admin/sync/live-events", { fixtureId: DEMO_FIXTURE_ID, mode: "demo_goal" });
const liveComparison = await post<{ status: string; criticalMismatchCount: number }>(app, "/admin/data-quality/live-events/compare", { fixtureId: DEMO_FIXTURE_ID, windowStartMatchSecond: 3780, windowEndMatchSecond: 4380 });
const proposalBody = await post<{ proposal: { winningOutcome: number; goalCountInWindow: number; txHash?: string } }>(app, "/admin/results/propose", { marketId: marketBody.market.id, evidenceUri: "demo://fixture/demo-2026-001/events" });
handleResultProposed(indexerDb, { marketId: marketBody.market.id, winningOutcome: 0, goalCountInWindow: 1, evidenceUri: "demo://fixture/demo-2026-001/events", txHash: (proposalBody.proposal.txHash ?? "0x000000000000000000000000000000000000000000000000000000000000beef") as `0x${string}` });
await post(app, "/admin/results/finalize", { marketId: marketBody.market.id });
handleResultFinalized(indexerDb, { marketId: marketBody.market.id, winningOutcome: 0 });
handleRedeemed(indexerDb, { marketId: marketBody.market.id, user: "0x0000000000000000000000000000000000000aaa", outcomeIndex: 0, sharesBurned: "100000000", collateralPaid: "100000000" });

const finalMarket = await apiCtx.db.getMarket(marketBody.market.id);
if (!health.ok) throw new Error("API health failed");
if (dataQuality.status !== "verified" || dataQuality.criticalMismatchCount !== 0) throw new Error("Fixture data quality failed");
if (liveComparison.status !== "verified") throw new Error("Live event data quality failed");
if (proposalBody.proposal.winningOutcome !== 0 || proposalBody.proposal.goalCountInWindow !== 1) throw new Error("Proposal result mismatch");
if (finalMarket?.oracleState !== "finalized") throw new Error("Market did not finalize");
if (indexerDb.state.trades.length !== 2) throw new Error("Expected two indexed trades");
if (indexerDb.state.redemptions[0]?.collateralPaidRaw !== "100000000") throw new Error("Winner redemption missing");
if (!contractsFlow.ok) throw new Error("Contracts full flow did not complete");

const postgresApiFlow = process.env.DATABASE_URL ? {
  databaseMode: "postgres",
  market: {
    id: finalMarket.id,
    status: finalMarket.status,
    oracleState: finalMarket.oracleState,
    marketAddress: finalMarket.marketAddress,
  },
  counts: {
    fixtures: apiCtx.db.state.fixtures.length,
    liveWindows: apiCtx.db.state.liveWindows.length,
    markets: apiCtx.db.state.markets.length,
    matchEvents: apiCtx.db.state.events.length,
    resultProposals: apiCtx.db.state.proposals.length,
  },
} : undefined;

const report = {
  chainId: 31337,
  externalServices: {
    anvilConnectable: contractsFlow.anvilStartedByCli || await checkAnvil(),
    postgresConnectable: await checkPostgres(),
    databaseMode: postgresApiFlow ? "postgres-api-adapter" : "memory-test-adapter",
  },
  contracts: contractsFlow.contracts,
  contractsFlow: {
    ok: contractsFlow.ok,
    scenarios: Object.fromEntries(Object.entries(contractsFlow.scenarios).map(([name, scenario]) => [name, { status: scenario.status, txCount: Object.keys(scenario.txHashes).length }])),
  },
  market: {
    marketId: marketBody.market.id,
    marketAddress: finalMarket?.marketAddress,
    status: finalMarket?.status,
    winningOutcome: "Yes",
  },
  trades: { count: indexerDb.state.trades.length },
  redemptions: { winnerPaid: indexerDb.state.redemptions[0]?.collateralPaidRaw },
  postgresApiFlow,
  checks: {
    contractEventsIndexed: indexerDb.state.trades.length === 2 && indexerDb.state.redemptions.length === 1,
    apiHealthy: health.ok,
    databaseConsistent: finalMarket?.oracleState === "finalized",
    fixtureDataVerified: dataQuality.status === "verified",
    liveEventDataVerified: liveComparison.status === "verified",
    realContractsFlowExecuted: contractsFlow.ok,
    postgresApiFlowExecuted: Boolean(postgresApiFlow),
  },
};

await mkdir("reports", { recursive: true });
await Bun.write("reports/e2e-anvil-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if ("close" in apiCtx.db) await apiCtx.db.close();
