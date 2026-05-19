import { InMemoryDb, PostgresDb } from "@worldcup/db";

export type AppContext = {
  db: InMemoryDb | PostgresDb;
};

export function createAppContext(db = new InMemoryDb()): AppContext {
  return { db };
}

export async function createAppContextFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<AppContext> {
  if (!env.DATABASE_URL) return createAppContext();
  const reset = env.POSTGRES_RESET === "true";
  return { db: await PostgresDb.create(env.DATABASE_URL, { reset }) };
}
