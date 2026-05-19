import { mkdirSync, writeFileSync } from "node:fs";
import { InMemoryDb } from "@worldcup/db";
import { DEMO_FIXTURE_ID, DEMO_LIVE_WINDOW } from "@worldcup/shared";

const db = new InMemoryDb();
const liveWindow = db.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: DEMO_LIVE_WINDOW.startMatchSecond, endMatchSecond: DEMO_LIVE_WINDOW.endMatchSecond });
db.createMarket(liveWindow.id);
const comparison = db.syncDemoMarketOdds("market-demo-63-73", 5100);
const report = {
  ok: comparison.status === "verified",
  importedAt: new Date().toISOString(),
  snapshots: db.state.oddsSnapshots.length,
  comparison,
  target: "reports/import-provider-odds-report.json",
};

mkdirSync("reports", { recursive: true });
writeFileSync("reports/import-provider-odds-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
