import { mkdirSync, writeFileSync } from "node:fs";
import { InMemoryDb } from "@worldcup/db";
import { DEMO_FIXTURE_ID } from "@worldcup/shared";

const started = performance.now();
const db = new InMemoryDb();
for (let i = 0; i < 250; i += 1) {
  const start = 3600 + i;
  db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: i % 3 === 0 ? "goal_window_5m" : i % 3 === 1 ? "goal_window_10m" : "goal_window_15m", startMatchSecond: start });
  db.recordProviderHealth({ provider: "provider_a", status: "healthy", latencyMs: 120, lastUpdateAgeSeconds: 2, details: { iteration: i } });
}
const elapsedMs = performance.now() - started;
const checks = { createdMarkets: db.state.commercialMarkets.length, providerChecks: db.state.providerHealthChecks.length, elapsedMs: Number(elapsedMs.toFixed(2)), thresholdMs: 750 };
if (elapsedMs > checks.thresholdMs) throw new Error(`Commercial in-memory workload exceeded ${checks.thresholdMs}ms`);

mkdirSync("reports", { recursive: true });
writeFileSync("reports/performance-report.json", JSON.stringify({ ok: true, checks }, null, 2));
console.log("performance checks ok", checks);
