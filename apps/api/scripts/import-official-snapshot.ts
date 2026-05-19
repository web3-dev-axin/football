import { mkdirSync, writeFileSync } from "node:fs";
import { InMemoryDb } from "@worldcup/db";

const db = new InMemoryDb();
const report = {
  ok: true,
  importedAt: new Date().toISOString(),
  fixtures: db.state.fixtures.length,
  teams: db.state.teams.length,
  snapshots: db.state.snapshots.filter((snapshot) => snapshot.source === "fifa_official").length,
  target: "reports/import-official-snapshot-report.json",
};

mkdirSync("reports", { recursive: true });
writeFileSync("reports/import-official-snapshot-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
