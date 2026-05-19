import postgres from "postgres";
import { createDemoState } from "./client";
import { applyPostgresMigrations, persistPostgresState } from "./postgres-flow";

type SeedSummary = {
  databaseUrl: string | null;
  teams: number;
  fixtures: number;
  snapshots: number;
  comparisons: number;
  commercialMarkets: {
    total: number;
    matchWinner: number;
    exactScore: number;
  };
};

function summarizeState(databaseUrl: string | null, state: ReturnType<typeof createDemoState>): SeedSummary {
  const matchWinner = state.commercialMarkets.filter((market) => market.marketType === "match_winner").length;
  const exactScore = state.commercialMarkets.filter((market) => market.marketType === "exact_score").length;
  return {
    databaseUrl,
    teams: state.teams.length,
    fixtures: state.fixtures.length,
    snapshots: state.snapshots.length,
    comparisons: state.comparisons.length,
    commercialMarkets: {
      total: state.commercialMarkets.length,
      matchWinner,
      exactScore,
    },
  };
}

async function persist(databaseUrl: string): Promise<SeedSummary> {
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
  try {
    await applyPostgresMigrations(sql);
    const state = createDemoState();
    await persistPostgresState(sql, state);

    const [{ teams }] = await sql<Array<{ teams: string }>>`select count(*)::text as teams from teams`;
    const [{ fixtures }] = await sql<Array<{ fixtures: string }>>`select count(*)::text as fixtures from fixtures`;
    const [{ snapshots }] = await sql<Array<{ snapshots: string }>>`select count(*)::text as snapshots from data_source_snapshots`;
    const [{ comparisons }] = await sql<Array<{ comparisons: string }>>`select count(*)::text as comparisons from data_comparisons`;
    const [{ commercial }] = await sql<Array<{ commercial: string }>>`select count(*)::text as commercial from commercial_market_definitions`;
    const [{ matchWinner }] = await sql<Array<{ matchWinner: string }>>`select count(*)::text as "matchWinner" from commercial_market_definitions where market_type = 'match_winner'`;
    const [{ exactScore }] = await sql<Array<{ exactScore: string }>>`select count(*)::text as "exactScore" from commercial_market_definitions where market_type = 'exact_score'`;

    return {
      databaseUrl,
      teams: Number(teams),
      fixtures: Number(fixtures),
      snapshots: Number(snapshots),
      comparisons: Number(comparisons),
      commercialMarkets: {
        total: Number(commercial),
        matchWinner: Number(matchWinner),
        exactScore: Number(exactScore),
      },
    };
  } finally {
    await sql.end();
  }
}

const databaseUrl = process.env.DATABASE_URL?.trim() || null;

if (databaseUrl) {
  const summary = await persist(databaseUrl);
  console.log(JSON.stringify({ ok: true, mode: "postgres", summary }, null, 2));
} else {
  const state = createDemoState();
  console.log(JSON.stringify({ ok: true, mode: "in-memory", summary: summarizeState(null, state) }, null, 2));
}
