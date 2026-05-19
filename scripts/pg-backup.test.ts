import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatBackupStamp,
  parseRetentionDays,
  pruneOldDumpFiles,
  repoRootFromThisFile,
  runPgBackup,
} from "./pg-backup";

describe("pg-backup helpers", () => {
  test("formatBackupStamp uses UTC YYYYMMDDTHHMMSSZ", () => {
    const d = new Date("2026-05-19T14:03:07.000Z");
    expect(formatBackupStamp(d)).toBe("20260519T140307Z");
  });

  test("parseRetentionDays accepts positive integers only", () => {
    expect(parseRetentionDays(undefined)).toBeNull();
    expect(parseRetentionDays("")).toBeNull();
    expect(parseRetentionDays("  ")).toBeNull();
    expect(parseRetentionDays("14")).toBe(14);
    expect(parseRetentionDays("0")).toBeNull();
    expect(parseRetentionDays("-3")).toBeNull();
    expect(parseRetentionDays("abc")).toBeNull();
  });

  test("repoRootFromThisFile resolves monorepo root", () => {
    const root = repoRootFromThisFile();
    expect(existsSync(join(root, "package.json"))).toBe(true);
  });
});

describe("pruneOldDumpFiles", () => {
  test("deletes only polygoal-*.dump older than retention window", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pg-backup-test-"));
    const now = new Date("2026-06-01T12:00:00.000Z");
    const oldTime = new Date("2026-05-01T12:00:00.000Z");
    const freshTime = new Date("2026-05-30T12:00:00.000Z");

    await writeFile(join(dir, "polygoal-old.dump"), "x");
    await utimes(join(dir, "polygoal-old.dump"), oldTime, oldTime);

    await writeFile(join(dir, "polygoal-fresh.dump"), "x");
    await utimes(join(dir, "polygoal-fresh.dump"), freshTime, freshTime);

    await writeFile(join(dir, "other.txt"), "x");
    await writeFile(join(dir, "not-polygoal.dump"), "x");

    const deleted = await pruneOldDumpFiles(dir, 14, now);
    expect(deleted.sort()).toEqual(["polygoal-old.dump"]);

    await expect(stat(join(dir, "polygoal-fresh.dump"))).resolves.toBeDefined();
    await expect(stat(join(dir, "other.txt"))).resolves.toBeDefined();
    await expect(stat(join(dir, "not-polygoal.dump"))).resolves.toBeDefined();
    await expect(stat(join(dir, "polygoal-old.dump"))).rejects.toThrow();
  });
});

describe("runPgBackup", () => {
  test("writes dump path and runs injected pg_dump", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pg-backup-run-"));
    const fixed = new Date("2026-01-02T03:04:05.000Z");
    let sawUrl = "";
    let sawOut = "";
    const { outputPath, pruned } = await runPgBackup({
      databaseUrl: "postgres://u:p@localhost:5432/db",
      backupDir: dir,
      retentionDays: null,
      now: fixed,
      async runPgDump(url, out) {
        sawUrl = url;
        sawOut = out;
        await writeFile(out, "fake");
      },
    });
    expect(sawUrl).toBe("postgres://u:p@localhost:5432/db");
    expect(sawOut).toBe(outputPath);
    expect(outputPath).toEndWith("polygoal-20260102T030405Z.dump");
    expect(pruned).toEqual([]);
    await expect(stat(outputPath)).resolves.toBeDefined();
  });

  test("prunes when retentionDays is set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pg-backup-ret-"));
    const now = new Date("2026-06-01T12:00:00.000Z");
    const oldTime = new Date("2026-05-01T12:00:00.000Z");
    await writeFile(join(dir, "polygoal-old.dump"), "x");
    await utimes(join(dir, "polygoal-old.dump"), oldTime, oldTime);

    const { pruned } = await runPgBackup({
      databaseUrl: "postgres://x",
      backupDir: dir,
      retentionDays: 14,
      now,
      async runPgDump(_, out) {
        await writeFile(out, "fake");
      },
    });
    expect(pruned).toContain("polygoal-old.dump");
  });
});
