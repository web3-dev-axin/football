import { mkdirSync, writeFileSync } from "node:fs";
import { InMemoryDb } from "@worldcup/db";
import { createApiApp } from "../apps/api/src/app";
import { createAppContext } from "../apps/api/src/services/app-context";

const app = createApiApp(createAppContext(new InMemoryDb()));
const unauthorized = await app.request("/admin/markets/market-demo-63-73/pause", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operatorId: "", reason: "missing operator" }) });
const cardFlags = await app.request("/market-types");
const matrix = await cardFlags.json() as { marketTypes: Array<{ marketType: string; enabledByDefault: boolean }> };
const unsafeMarketsDisabled = matrix.marketTypes.filter((market) => market.marketType.includes("card") || market.marketType.includes("corner")).every((market) => !market.enabledByDefault);

const checks = { unauthorizedStatus: unauthorized.status, unsafeMarketsDisabled };
if (unauthorized.status !== 401) throw new Error("Operator routes must reject missing operator identity");
if (!unsafeMarketsDisabled) throw new Error("Card/corner markets must be feature gated off by default");

mkdirSync("reports", { recursive: true });
writeFileSync("reports/security-report.json", JSON.stringify({ ok: true, checks }, null, 2));
console.log("security checks ok", checks);
