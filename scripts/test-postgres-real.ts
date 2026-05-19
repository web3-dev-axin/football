import { mkdir } from "node:fs/promises";
import { runPostgresRealFlow } from "@polygoal/db";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for real Postgres testing");
}

const report = await runPostgresRealFlow(databaseUrl, { reset: true });

await mkdir("reports", { recursive: true });
await Bun.write("reports/postgres-real-flow-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
