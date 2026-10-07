import { sql } from "drizzle-orm";
import { CHANNEL } from "./client";
import type { Db, Tx } from "./client";

/**
 * Announces that something changed. Sent inside the transaction so it
 * only fires on commit, which is what makes "the worker woke up and saw
 * the job" and "the SSE stream sent the new state" safe to rely on.
 */
export async function notify(tx: Tx | Db, payload = "changed"): Promise<void> {
  await tx.execute(sql`select pg_notify(${CHANNEL}, ${payload})`);
}
