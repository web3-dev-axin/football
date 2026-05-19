import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const commands = ["bun run test:full"];
const commandResults: Array<{ command: string; exitCode: number; outputTail: string; elapsedMs: number }> = [];

for (const command of commands) {
  const started = performance.now();
  const result = Bun.spawnSync(["bash", "-lc", command], { stdout: "pipe", stderr: "pipe" });
  const output = `${result.stdout.toString()}${result.stderr.toString()}`;
  commandResults.push({ command, exitCode: result.exitCode, outputTail: output.slice(-20_000), elapsedMs: Math.round(performance.now() - started) });
  if (result.exitCode !== 0) break;
}

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const artifacts = {
  contractsFullFlow: readJson("reports/contracts-full-flow-report.json"),
  e2eAnvil: readJson("reports/e2e-anvil-report.json"),
  postgresRealFlow: readJson("reports/postgres-real-flow-report.json"),
  commercialMatrix: readJson("reports/commercial-matrix-report.json"),
  security: readJson("reports/security-report.json"),
  performance: readJson("reports/performance-report.json"),
  officialImport: readJson("reports/import-official-snapshot-report.json"),
  oddsImport: readJson("reports/import-provider-odds-report.json"),
};

const ok = commandResults.every((result) => result.exitCode === 0);
const summary = {
  ok,
  generatedAt: new Date().toISOString(),
  commands: commandResults.map(({ command, exitCode, elapsedMs }) => ({ command, exitCode, elapsedMs })),
  artifacts,
};

mkdirSync("reports", { recursive: true });
writeFileSync("reports/full-flow-test-report.json", JSON.stringify(summary, null, 2));

const lines = [
  "# Full Flow Test Report",
  "",
  `Status: ${ok ? "PASS" : "FAIL"}`,
  `Generated at: ${summary.generatedAt}`,
  "",
  "## Commands",
  ...commandResults.map((result) => `- ${result.exitCode === 0 ? "PASS" : "FAIL"} \`${result.command}\` (${result.elapsedMs}ms)`),
  "",
  "## Review Fix Coverage",
  "- Product discovery: `/teams`, `/schedule`, and `/odds/markets/:marketId` are covered by API tests.",
  "- Product UX: schedule grouping, `TradeTicket`, and outcome cards are covered by web render tests.",
  "- Data plane: `@polygoal/odds-ingestion`, odds schema, and import scripts produce report artifacts.",
  "- Chain flow: `contracts:flow` is included in `test:full` and E2E report generation.",
  "",
  "## Artifacts",
  ...Object.entries(artifacts).map(([name, value]) => `- ${value ? "PRESENT" : "MISSING"} ${name}`),
  "",
  "## Output Tail",
  "```text",
  ...commandResults.flatMap((result) => [`$ ${result.command}`, result.outputTail, ""]),
  "```",
  "",
];
writeFileSync("reports/full-flow-test-report.md", lines.join("\n"));

if (!ok) throw new Error("Full-flow test report failed");
console.log(JSON.stringify(summary, null, 2));
