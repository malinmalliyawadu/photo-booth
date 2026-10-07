import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  ACTIVE_PHASES,
  beginSession,
  newShortId,
  transition,
  type SessionEvent,
  type SessionState,
  type Transition,
} from "@booth/core";
import { db, type Db, type Tx } from "./client";
import { readBooth } from "./booth";
import { enqueueEffects, enqueueJob } from "./jobs";
import { notify } from "./notify";
import { jobs, sessions, shots, templates, type SessionRow } from "./schema";
import { removeData, sessionPaths } from "./storage";

export class SessionError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 = 409,
  ) {
    super(message);
  }
}

export function rowToState(row: SessionRow): SessionState {
  return {
    phase: row.phase,
    shotCount: row.shotCount,
    shot: row.shot,
    takenCount: row.takenCount,
    attempts: row.attempts,
    countdownSeconds: row.countdownSeconds,
    countdownEndsAt: row.countdownEndsAt?.toISOString() ?? null,
    print: row.print,
    reason: row.reason,
  };
}

function stateToColumns(state: SessionState) {
  return {
    phase: state.phase,
    shot: state.shot,
    takenCount: state.takenCount,
    attempts: state.attempts,
    countdownEndsAt: state.countdownEndsAt ? new Date(state.countdownEndsAt) : null,
    print: state.print,
    reason: state.reason,
    updatedAt: new Date(),
    ...(ACTIVE_PHASES.includes(state.phase) ? {} : { finishedAt: new Date() }),
  };
}

export async function findActiveSession(dbOrTx: Db | Tx): Promise<SessionRow | null> {
  const row = await dbOrTx.query.sessions.findFirst({
    where: and(inArray(sessions.phase, [...ACTIVE_PHASES]), isNull(sessions.deletedAt)),
    orderBy: desc(sessions.createdAt),
  });
  return row ?? null;
}

/**
 * A guest tapped a layout. Refused while paused, while another session
 * is active, or for a layout that is not offered - all three are things
 * a second finger on the iPad can cause.
 */
export async function startSession(templateId: string, now = new Date()): Promise<SessionRow> {
  return db.transaction(async (tx) => {
    // Serialise starts: two taps must not both find "no active session".
    await tx.execute(sql`select pg_advisory_xact_lock(1)`);
    const settings = await readBooth(tx);
    if (settings.paused) throw new SessionError("The booth is paused");
    if (settings.lockedTemplateId && settings.lockedTemplateId !== templateId) {
      throw new SessionError("That layout is not offered right now", 400);
    }
    const template = await tx.query.templates.findFirst({ where: eq(templates.id, templateId) });
    if (!template || !template.active) throw new SessionError("That layout is not offered right now", 400);
    const active = await findActiveSession(tx);
    if (active) throw new SessionError("Another session is in progress");

    const { state, effects } = beginSession(
      { shotCount: template.shotCount, countdownSeconds: settings.countdownSeconds },
      now,
    );
    const id = newShortId();
    const [row] = await tx
      .insert(sessions)
      .values({
        id,
        templateId,
        shotCount: state.shotCount,
        countdownSeconds: state.countdownSeconds,
        ...stateToColumns(state),
      })
      .returning();
    await enqueueEffects(tx, id, effects, now);
    await notify(tx);
    return row!;
  });
}

/**
 * The one way a session changes. Loads the row under a lock, runs the
 * state machine, persists the result and queues its effects, all in one
 * transaction, so the app and the worker cannot race each other into an
 * impossible state. A stale timing event commits nothing.
 */
export async function applySessionEvent(
  id: string,
  event: SessionEvent,
  now = new Date(),
): Promise<Transition & { row: SessionRow }> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(sessions).where(eq(sessions.id, id)).for("update");
    if (!row || row.deletedAt) throw new SessionError("No such session", 404);
    const result = transition(rowToState(row), event, now);
    if (!result.ok) return { ...result, row };
    if (result.stale) return { ...result, row };
    const [updated] = await tx
      .update(sessions)
      .set(stateToColumns(result.state))
      .where(eq(sessions.id, id))
      .returning();
    await enqueueEffects(tx, id, result.effects, now);
    await notify(tx);
    return { ...result, row: updated! };
  });
}

/** Same as applySessionEvent but a refusal throws, for route handlers. */
export async function commandSession(id: string, event: SessionEvent): Promise<SessionRow> {
  const result = await applySessionEvent(id, event);
  if (!result.ok) throw new SessionError(result.reason);
  return result.row;
}

/** A shot landed on disk: record it, then let the state machine move on. */
export async function recordShot(id: string, shot: number, path: string): Promise<Transition & { row: SessionRow }> {
  await db
    .insert(shots)
    .values({ sessionId: id, shot, path })
    .onConflictDoUpdate({ target: [shots.sessionId, shots.shot], set: { path, takenAt: new Date() } });
  return applySessionEvent(id, { type: "shot_taken", shot });
}

export async function setComposite(
  id: string,
  paths: { compositePath: string; webPath: string; thumbPath: string },
): Promise<void> {
  await db.update(sessions).set({ ...paths, updatedAt: new Date() }).where(eq(sessions.id, id));
}

export async function markSynced(id: string): Promise<void> {
  await db.update(sessions).set({ syncedAt: new Date(), updatedAt: new Date() }).where(eq(sessions.id, id));
}

export async function countPrint(id: string): Promise<void> {
  await db
    .update(sessions)
    .set({ printCount: sql`${sessions.printCount} + 1`, updatedAt: new Date() })
    .where(eq(sessions.id, id));
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const row = await db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  return row ?? null;
}

/** Another print for a finished session, from the admin page. */
export async function reprintSession(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await tx.query.sessions.findFirst({ where: eq(sessions.id, id) });
    if (!row || row.deletedAt) throw new SessionError("No such session", 404);
    if (row.takenCount < row.shotCount) throw new SessionError("That session has no photos to print", 400);
    await enqueueJob(tx, { kind: "print", sessionId: id, payload: { reprint: true }, maxAttempts: 1 });
    await notify(tx);
  });
}

/**
 * Delete on request. The row stays so numbering and the admin history
 * hold together; the photos go, and pending jobs for it are dropped.
 */
export async function deleteSession(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await tx.query.sessions.findFirst({ where: eq(sessions.id, id) });
    if (!row) throw new SessionError("No such session", 404);
    await tx
      .update(sessions)
      .set({
        deletedAt: new Date(),
        phase: ACTIVE_PHASES.includes(row.phase) ? "abandoned" : row.phase,
        reason: ACTIVE_PHASES.includes(row.phase) ? "deleted by the attendant" : row.reason,
        compositePath: null,
        webPath: null,
        thumbPath: null,
        countdownEndsAt: null,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, id));
    await tx.delete(shots).where(eq(shots.sessionId, id));
    await tx.delete(jobs).where(and(eq(jobs.sessionId, id), inArray(jobs.status, ["queued", "running"])));
    await notify(tx);
  });
  await removeData(sessionPaths.dir(id));
}
