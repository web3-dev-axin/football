import { mkdirSync, writeFileSync } from "node:fs";
import { InMemoryDb } from "@polygoal/db";
import { DEMO_FIXTURE_ID } from "@polygoal/shared";

const started = performance.now();
const db = new InMemoryDb();
db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "match_winner", startMatchSecond: 0 });
db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "exact_score", startMatchSecond: 0 });
for (let i = 0; i < 250; i += 1) {
  db.recordProviderHealth({ provider: "provider_a", status: "healthy", latencyMs: 120, lastUpdateAgeSeconds: 2, details: { iteration: i } });
}
const elapsedMs = performance.now() - started;
const checks = { createdMarkets: db.state.commercialMarkets.length, providerChecks: db.state.providerHealthChecks.length, elapsedMs: Number(elapsedMs.toFixed(2)), thresholdMs: 750 };
if (elapsedMs > checks.thresholdMs) throw new Error(`Commercial in-memory workload exceeded ${checks.thresholdMs}ms`);

mkdirSync("reports", { recursive: true });
writeFileSync("reports/performance-report.json", JSON.stringify({ ok: true, checks }, null, 2));
console.log("performance checks ok", checks);
