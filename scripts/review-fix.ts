import { mkdirSync, writeFileSync } from "node:fs";

const commands = [
  "bun run typecheck",
  "bun run lint",
  "bun run test",
  "bun run coverage",
  "bun run contracts:flow",
  "bun run test:e2e:anvil",
  "bun run test:commercial-matrix",
  "bun run test:security",
  "bun run test:performance",
  "bun run import:official",
  "bun run import:odds",
];

mkdirSync("reports/review-fix", { recursive: true });
const summary: Array<{ round: number; ok: boolean; commands: Array<{ command: string; exitCode: number }> }> = [];

for (let round = 1; round <= 3; round += 1) {
  const commandResults: Array<{ command: string; exitCode: number; output: string }> = [];
  console.log(`review-fix round ${round} starting`);
  for (const command of commands) {
    const started = performance.now();
    const result = Bun.spawnSync(["bash", "-lc", command], { stdout: "pipe", stderr: "pipe" });
    const output = `${result.stdout.toString()}${result.stderr.toString()}`;
    const elapsedMs = Math.round(performance.now() - started);
    commandResults.push({ command, exitCode: result.exitCode, output: output.slice(-12_000) });
    console.log(`  ${result.exitCode === 0 ? "PASS" : "FAIL"} ${command} (${elapsedMs}ms)`);
    if (result.exitCode !== 0) break;
  }
  const ok = commandResults.every((result) => result.exitCode === 0) && commandResults.length === commands.length;
  summary.push({ round, ok, commands: commandResults.map(({ command, exitCode }) => ({ command, exitCode })) });
  const body = [
    `# Review-Fix Round ${round}`,
    "",
    `Status: ${ok ? "PASS" : "FAIL"}`,
    "",
    "## Commands",
    ...commandResults.map((result) => `- ${result.exitCode === 0 ? "PASS" : "FAIL"} \`${result.command}\``),
    "",
    "## Output Tail",
    "```text",
    ...commandResults.flatMap((result) => [`$ ${result.command}`, result.output || "<no output>", ""]),
    "```",
    "",
  ].join("\n");
  writeFileSync(`reports/review-fix/round-${round}.md`, body);
  if (!ok) {
    writeFileSync("reports/review-fix/summary.json", JSON.stringify({ ok: false, summary }, null, 2));
    throw new Error(`Review-fix round ${round} failed`);
  }
}

writeFileSync("reports/review-fix/summary.json", JSON.stringify({ ok: true, summary }, null, 2));
console.log("review-fix complete: 3 passing rounds recorded");
