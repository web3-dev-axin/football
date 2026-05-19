import { InMemoryDb, PostgresDb } from "@polygoal/db";
import { PonderReader } from "./ponder-reader";

export type AppContext = {
  db: InMemoryDb | PostgresDb;
  ponder?: PonderReader;
};

export function createAppContext(db = new InMemoryDb(), ponder?: PonderReader): AppContext {
  return { db, ponder };
}

export async function createAppContextFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<AppContext> {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) return createAppContext();
  const reset = env.POSTGRES_RESET === "true";
  const db = await PostgresDb.create(databaseUrl, { reset });
  const ponder = await PonderReader.create(databaseUrl, env.PONDER_SCHEMA ?? "ponder").catch(() => null);
  return { db, ponder: ponder ?? undefined };
}
