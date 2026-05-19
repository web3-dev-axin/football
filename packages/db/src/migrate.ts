import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log("DATABASE_URL is not set; migration skipped for local in-memory development.");
  process.exit(0);
}

const sql = postgres(databaseUrl, { max: 1 });
const migrationDir = join(new URL(".", import.meta.url).pathname, "..", "migrations");
const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();

for (const file of files) {
  const migration = await readFile(join(migrationDir, file), "utf8");
  await sql.unsafe(migration);
  console.log(`applied ${file}`);
}

await sql.end();
