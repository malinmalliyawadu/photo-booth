import { eq, sql } from "drizzle-orm";
import { db, type Db, type Tx } from "./client";
import { notify } from "./notify";
import { booth, components, type BoothRow, type ComponentName, type ComponentStatus } from "./schema";

export async function readBooth(db: Db | Tx): Promise<BoothRow> {
  const row = await db.query.booth.findFirst({ where: eq(booth.id, 1) });
  if (!row) throw new Error("The booth row is missing: run `pnpm db:seed`");
  return row;
}

export type BoothPatch = Partial<
  Pick<BoothRow, "eventName" | "paused" | "cameraMode" | "countdownSeconds" | "paperLeft" | "paperPackSize" | "lockedTemplateId">
>;

export async function updateBooth(patch: BoothPatch): Promise<BoothRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(booth)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(booth.id, 1))
      .returning();
    if (!row) throw new Error("The booth row is missing");
    await notify(tx);
    return row;
  });
}

/** One sheet went through the printer. Never goes below zero. */
export async function consumePaper(db: Db | Tx): Promise<number> {
  const [row] = await db
    .update(booth)
    .set({ paperLeft: sql`greatest(${booth.paperLeft} - 1, 0)`, updatedAt: new Date() })
    .where(eq(booth.id, 1))
    .returning({ paperLeft: booth.paperLeft });
  return row?.paperLeft ?? 0;
}

/**
 * The worker's heartbeat for each moving part. Written often and read
 * by the admin page, so it only notifies when the status or detail
 * changed - a steady "ok" every few seconds should not wake every
 * SSE client.
 */
export async function reportComponent(
  db: Db,
  name: ComponentName,
  status: ComponentStatus,
  detail: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await tx.query.components.findFirst({ where: eq(components.name, name) });
    await tx
      .insert(components)
      .values({ name, status, detail, seenAt: new Date() })
      .onConflictDoUpdate({ target: components.name, set: { status, detail, seenAt: new Date() } });
    if (!before || before.status !== status || before.detail !== detail) await notify(tx);
  });
}
