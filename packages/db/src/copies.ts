import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { GUEST_COPY_WINDOW_MS, copyRefusal, isFindable, type CopyBooth, type CopySession } from "@booth/core";
import { db, type Db, type Tx } from "./client";
import { readBooth } from "./booth";
import { enqueueJob, queueCounts } from "./jobs";
import { notify } from "./notify";
import { components, sessions, type SessionRow } from "./schema";
import { SessionError } from "./sessions";
import { mediaUrl } from "./storage";

/** One of the evening's prints, as the kiosk's "Print a copy" wall shows it. */
export interface PrintView {
  id: string;
  number: number;
  templateId: string;
  webUrl: string;
  thumbUrl: string;
  createdAt: string;
  guestCopies: number;
}

export function copySession(row: SessionRow): CopySession {
  return {
    phase: row.phase,
    composed: row.compositePath !== null && row.webPath !== null && row.thumbPath !== null,
    deleted: row.deletedAt !== null,
    createdAt: row.createdAt,
    guestCopies: row.guestCopies,
  };
}

/** The booth's side of `copyRefusal`: the setting, the supplies, the queue and the printer card. */
export async function readCopyBooth(dbOrTx: Db | Tx): Promise<CopyBooth> {
  const [settings, queue, printer] = await Promise.all([
    readBooth(dbOrTx),
    queueCounts(dbOrTx),
    dbOrTx.query.components.findFirst({ where: eq(components.name, "printer") }),
  ]);
  return {
    guestCopyLimit: settings.guestCopyLimit,
    paperLeft: settings.paperLeft,
    inkLeft: settings.inkLeft,
    pendingPrints: queue.pendingPrints,
    printerDown: printer?.status === "error",
  };
}

/**
 * The prints a guest can find at the kiosk, newest first: tonight's
 * finished sessions with a postcard, none deleted (see `isFindable`).
 * Fetched when the guest opens the wall rather than carried in every
 * snapshot, which goes to every screen on every change.
 */
export async function listFindablePrints(now = new Date()): Promise<PrintView[]> {
  const rows = await db.query.sessions.findMany({
    where: and(
      eq(sessions.phase, "done"),
      isNull(sessions.deletedAt),
      isNotNull(sessions.compositePath),
      gte(sessions.createdAt, new Date(now.getTime() - GUEST_COPY_WINDOW_MS)),
    ),
    orderBy: desc(sessions.createdAt),
  });
  return rows
    .filter((r) => isFindable(copySession(r), now))
    .map((r) => ({
      id: r.id,
      number: r.number,
      templateId: r.templateId,
      webUrl: mediaUrl(r.webPath)!,
      thumbUrl: mediaUrl(r.thumbPath)!,
      createdAt: r.createdAt.toISOString(),
      guestCopies: r.guestCopies,
    }));
}

/**
 * A guest asked for a copy of an earlier print at the kiosk. Copies
 * are serialised while the count and the cards are checked and the job
 * is queued, so two quick taps cannot both have the last copy or the
 * last spare card; the print itself is the same job as the attendant's
 * Reprint. Refused, with the words the kiosk shows, by `copyRefusal`.
 */
export async function printGuestCopy(id: string, now = new Date()): Promise<{ guestCopies: number }> {
  return db.transaction(async (tx) => {
    // Serialise copies: two guests' copies must not both count the same last cards.
    await tx.execute(sql`select pg_advisory_xact_lock(2)`);
    const [row] = await tx.select().from(sessions).where(eq(sessions.id, id)).for("update");
    if (!row) throw new SessionError("No such session", 404);
    const refusal = copyRefusal(await readCopyBooth(tx), copySession(row), now);
    if (refusal) throw new SessionError(refusal);
    const [updated] = await tx
      .update(sessions)
      .set({ guestCopies: sql`${sessions.guestCopies} + 1`, updatedAt: now })
      .where(eq(sessions.id, id))
      .returning({ guestCopies: sessions.guestCopies });
    await enqueueJob(tx, { kind: "print", sessionId: id, payload: { reprint: true, guest: true }, maxAttempts: 1 });
    await notify(tx);
    return updated!;
  });
}
