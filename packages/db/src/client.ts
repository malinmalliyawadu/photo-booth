import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// One pool per process; the globalThis stash keeps Next's dev HMR from
// opening a new pool on every reload.
const globalForDb = globalThis as unknown as { boothPool: Pool | undefined };

// No guard on DATABASE_URL here on purpose: this module is evaluated
// during `next build`, which has no database. `migrate.ts` checks it
// with a clear message, and both services run that first.
export const pool: Pool =
  globalForDb.boothPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 8,
  });

if (process.env.NODE_ENV !== "production") globalForDb.boothPool = pool;

export const db: Db = drizzle(pool, { schema });

/** The NOTIFY channel every state change is announced on. */
export const CHANNEL = "booth";
