import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import {
  ACTIVE_PHASES,
  beginSession,
  defaultFilter,
  newShortId,
  offeredFilters,
  transition,
  type FilterId,
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
    filter: row.filter,
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
    filter: state.filter,
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
 * a second finger on the iPad can cause. The photos start in the booth's
 * default look; the guest picks another on the review screen.
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
      {
        shotCount: template.shotCount,
        countdownSeconds: settings.countdownSeconds,
        filter: defaultFilter(offeredFilters(settings.filters)),
      },
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
  return applyWith(id, event, now);
}

/**
 * applySessionEvent, plus `alongside`: writes that belong to the event
 * and must commit only if the session accepts it. It returns the stored
 * files it replaced, which are removed once the transaction commits.
 */
async function applyWith(
  id: string,
  event: SessionEvent,
  now: Date,
  alongside?: (tx: Tx) => Promise<string[]>,
): Promise<Transition & { row: SessionRow }> {
  const discarded: string[] = [];
  const applied = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(sessions).where(eq(sessions.id, id)).for("update");
    if (!row || row.deletedAt) throw new SessionError("No such session", 404);
    const result = transition(rowToState(row), event, now);
    if (!result.ok) return { ...result, row };
    if (result.stale) return { ...result, row };
    // A retake starts the photos over. The old ones go in the same
    // commit, so no screen shows them while the new ones are taken.
    if (result.state.takenCount < row.takenCount) {
      const gone = await tx
        .delete(shots)
        .where(and(eq(shots.sessionId, id), gt(shots.shot, result.state.takenCount)))
        .returning({ path: shots.path });
      discarded.push(...gone.map((s) => s.path));
    }
    if (alongside) discarded.push(...(await alongside(tx)));
    const [updated] = await tx
      .update(sessions)
      .set(stateToColumns(result.state))
      .where(eq(sessions.id, id))
      .returning();
    await enqueueEffects(tx, id, result.effects, now);
    await notify(tx);
    return { ...result, row: updated! };
  });
  await removeAll(discarded);
  return applied;
}

/** Files nothing points at any more. A failure leaves litter, not a broken session. */
async function removeAll(paths: string[]): Promise<void> {
  await Promise.all(paths.map((p) => removeData(p).catch(() => undefined)));
}

/** Same as applySessionEvent but a refusal throws, for route handlers. */
export async function commandSession(id: string, event: SessionEvent): Promise<SessionRow> {
  const result = await applySessionEvent(id, event);
  if (!result.ok) throw new SessionError(result.reason);
  return result.row;
}

/** The guest tapped a filter on the review screen; it must be one the booth offers. */
export async function chooseFilter(id: string, filter: FilterId): Promise<SessionRow> {
  const settings = await readBooth(db);
  if (!offeredFilters(settings.filters).includes(filter)) {
    throw new SessionError("That filter is not offered right now", 400);
  }
  return commandSession(id, { type: "filter_chosen", filter });
}

/**
 * A shot landed on disk at `path` (a fresh `sessionPaths.shot`). It is
 * recorded only if the session is still waiting for it; a late frame
 * from an attempt the session gave up on is removed instead, so it can
 * never stand in for the photo that replaced it.
 */
export async function recordShot(id: string, shot: number, path: string): Promise<Transition & { row: SessionRow }> {
  let recorded = false;
  const result = await applyWith(id, { type: "shot_taken", shot }, new Date(), async (tx) => {
    recorded = true;
    const [before] = await tx
      .select({ path: shots.path })
      .from(shots)
      .where(and(eq(shots.sessionId, id), eq(shots.shot, shot)));
    await tx
      .insert(shots)
      .values({ sessionId: id, shot, path })
      .onConflictDoUpdate({ target: [shots.sessionId, shots.shot], set: { path, takenAt: new Date() } });
    return before && before.path !== path ? [before.path] : [];
  }).catch(async (err: unknown) => {
    await removeAll([path]);
    throw err;
  });
  if (!recorded) await removeAll([path]);
  return result;
}

/** Where one of a session's shots is stored, or null before it is taken. */
export async function shotPath(id: string, shot: number): Promise<string | null> {
  const [row] = await db
    .select({ path: shots.path })
    .from(shots)
    .where(and(eq(shots.sessionId, id), eq(shots.shot, shot)));
  return row?.path ?? null;
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
