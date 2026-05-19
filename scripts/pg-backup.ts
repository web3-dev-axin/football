/**
 * Logical backup of the Postgres database (pg_dump custom format).
 * Requires `pg_dump` on PATH; match server major version when possible.
 */
import { spawn } from "node:child_process";
import { existsSync, type Dirent } from "node:fs";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function repoRootFromThisFile(): string {
  return join(__dirname, "..");
}

/** UTC stamp matching GNU `date -u +"%Y%m%dT%H%M%SZ"`. */
export function formatBackupStamp(d: Date): string {
  const iso = d.toISOString();
  const [datePart, rest] = iso.split("T");
  const ymd = datePart.replaceAll("-", "");
  const hms = rest.slice(0, 8).replaceAll(":", "");
  return `${ymd}T${hms}Z`;
}

/** Positive integer days, or `null` to skip pruning (invalid / empty env). */
export function parseRetentionDays(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function loadDotenvFromRepoRoot(): string {
  const root = repoRootFromThisFile();
  const envPath = join(root, ".env");
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
  return root;
}

export async function pruneOldDumpFiles(
  backupDir: string,
  retentionDays: number,
  now: Date,
): Promise<string[]> {
  const cutoff = now.getTime() - retentionDays * 86_400_000;
  const deleted: string[] = [];
  let entries: Dirent<string>[];
  try {
    entries = await readdir(backupDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!/^polygoal-.+\.dump$/u.test(ent.name)) continue;
    const full = join(backupDir, ent.name);
    const st = await stat(full);
    if (st.mtimeMs < cutoff) {
      await unlink(full);
      deleted.push(ent.name);
    }
  }
  return deleted;
}

async function defaultRunPgDump(databaseUrl: string, outputPath: string): Promise<void> {
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      "pg_dump",
      ["--format=custom", "--no-owner", "--no-acl", "--file", outputPath, databaseUrl],
      { stdio: "inherit", shell: false },
    );
    child.on("error", reject);
    child.on("close", (c) => resolve(c ?? 1));
  });
  if (code !== 0) {
    throw new Error(`pg_dump exited with code ${code}`);
  }
}

export type RunPgBackupInput = {
  databaseUrl: string;
  backupDir: string;
  /** If set and > 0, delete `polygoal-*.dump` older than this many days. */
  retentionDays?: number | null;
  now?: Date;
  /** Override for tests (skip real `pg_dump`). */
  runPgDump?: (databaseUrl: string, outputPath: string) => Promise<void>;
};

export async function runPgBackup(input: RunPgBackupInput): Promise<{ outputPath: string; pruned: string[] }> {
  const now = input.now ?? new Date();
  const stamp = formatBackupStamp(now);
  const outputPath = join(input.backupDir, `polygoal-${stamp}.dump`);
  await mkdir(input.backupDir, { recursive: true });
  const dump = input.runPgDump ?? defaultRunPgDump;
  await dump(input.databaseUrl, outputPath);

  let pruned: string[] = [];
  if (input.retentionDays != null && input.retentionDays > 0) {
    pruned = await pruneOldDumpFiles(input.backupDir, input.retentionDays, now);
  }
  return { outputPath, pruned };
}

async function main(): Promise<void> {
  const root = loadDotenvFromRepoRoot();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Add it to .env or export it before running.");
    process.exit(1);
  }

  const backupDir = process.env.BACKUP_DIR?.trim() || join(root, "backups", "pg");
  const retentionDays = parseRetentionDays(process.env.BACKUP_RETENTION_DAYS);

  const { outputPath, pruned } = await runPgBackup({
    databaseUrl,
    backupDir,
    retentionDays,
    now: new Date(),
  });

  console.log(`Backup written: ${outputPath}`);
  if (pruned.length > 0) {
    console.log(`Pruned ${pruned.length} dump file(s) older than ${retentionDays} days in ${backupDir}`);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
