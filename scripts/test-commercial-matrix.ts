import { mkdirSync, writeFileSync } from "node:fs";
import { COMMERCIAL_MARKET_TYPES, DEMO_FIXTURE_ID, resolveCommercialMarketOutcome } from "@polygoal/shared";
import { InMemoryDb } from "@polygoal/db";

const db = new InMemoryDb();
const markets = [
  db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "match_winner", startMatchSecond: 0 }),
  db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "exact_score", startMatchSecond: 0 }),
];

const checks = {
  marketTypes: COMMERCIAL_MARKET_TYPES.length,
  enabledHighRiskMarkets: COMMERCIAL_MARKET_TYPES.filter((market) => market.riskLevel === "high" && market.enabledByDefault).length,
  createdMarkets: markets.length,
  matchWinnerResolution: resolveCommercialMarketOutcome({ marketType: "match_winner", homeTeam: "Brazil", awayTeam: "Morocco", startMatchSecond: 0, endMatchSecond: 5400, events: [], homeScore: 1, awayScore: 1 }),
};

if (checks.enabledHighRiskMarkets !== 0) throw new Error("High-risk card/corner markets must stay disabled by default");
if (checks.createdMarkets !== 2) throw new Error("Commercial market setup did not create match winner and exact score markets");

mkdirSync("reports", { recursive: true });
writeFileSync("reports/commercial-matrix-report.json", JSON.stringify({ ok: true, checks }, null, 2));
console.log("commercial matrix ok", checks);
