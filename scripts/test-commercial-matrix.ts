import { mkdirSync, writeFileSync } from "node:fs";
import { COMMERCIAL_MARKET_TYPES, DEMO_FIXTURE_ID, resolveCommercialMarketOutcome } from "@worldcup/shared";
import { InMemoryDb } from "@worldcup/db";

const db = new InMemoryDb();
const markets = [
  db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "goal_window_5m", startMatchSecond: 3780 }),
  db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "goal_window_10m", startMatchSecond: 3780 }),
  db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "goal_window_15m", startMatchSecond: 3780 }),
  db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "next_goal_team", startMatchSecond: 3780, endMatchSecond: 5400 }),
];

const checks = {
  marketTypes: COMMERCIAL_MARKET_TYPES.length,
  enabledHighRiskMarkets: COMMERCIAL_MARKET_TYPES.filter((market) => market.riskLevel === "high" && market.enabledByDefault).length,
  createdMarkets: markets.length,
  nextGoalResolution: resolveCommercialMarketOutcome({ marketType: "next_goal_team", homeTeam: "Brazil", awayTeam: "Morocco", startMatchSecond: 3780, endMatchSecond: 5400, events: [] }),
};

if (checks.enabledHighRiskMarkets !== 0) throw new Error("High-risk card/corner markets must stay disabled by default");
if (checks.createdMarkets !== 4) throw new Error("Commercial market matrix did not create all required markets");

mkdirSync("reports", { recursive: true });
writeFileSync("reports/commercial-matrix-report.json", JSON.stringify({ ok: true, checks }, null, 2));
console.log("commercial matrix ok", checks);
