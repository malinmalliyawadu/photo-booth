import { and, eq, lt, sql } from "drizzle-orm";
import type { Effect } from "@booth/core";
import type { Db, Tx } from "./client";
import { jobs, type JobRow } from "./schema";

/** Turns the state machine's effects into rows the worker will pick up. */
export async function enqueueEffects(tx: Tx, sessionId: string, effects: Effect[], now: Date): Promise<void> {
  if (effects.length === 0) return;
  await tx.insert(jobs).values(
    effects.map((e) => {
      switch (e.kind) {
        case "countdown":
          return { kind: e.kind, sessionId, payload: { shot: e.shot }, runAt: e.at };
        case "capture":
          return { kind: e.kind, sessionId, payload: { shot: e.shot }, runAt: now };
        case "timeout":
          return { kind: e.kind, sessionId, payload: { phase: e.phase, shot: e.shot }, runAt: e.at };
        case "compose":
        case "sync":
          return { kind: e.kind, sessionId, payload: {}, runAt: now };
        case "print":
          return { kind: e.kind, sessionId, payload: {}, runAt: now, maxAttempts: 1 };
      }
    }),
  );
}

export async function enqueueJob(
  tx: Tx | Db,
  job: { kind: JobRow["kind"]; sessionId?: string; payload?: Record<string, unknown>; runAt?: Date; maxAttempts?: number },
): Promise<void> {
  await tx.insert(jobs).values({
    kind: job.kind,
    sessionId: job.sessionId ?? null,
    payload: job.payload ?? {},
    runAt: job.runAt ?? new Date(),
    maxAttempts: job.maxAttempts ?? 3,
  });
}

/**
 * Claims the next due job for this worker, or null. The subquery with
 * SKIP LOCKED means two workers never take the same row and a worker
 * never waits on another's lock.
 */
export async function claimJob(db: Db, workerId: string): Promise<JobRow | null> {
  const rows = await db.execute<JobRow>(sql`
    update jobs set
      status = 'running',
      locked_by = ${workerId},
      locked_at = now(),
      attempts = attempts + 1
    where id = (
      select id from jobs
      where status = 'queued' and run_at <= now()
      order by run_at, id
      for update skip locked
      limit 1
    )
    returning
      id, kind, session_id as "sessionId", payload, run_at as "runAt", status, attempts,
      max_attempts as "maxAttempts", locked_by as "lockedBy", locked_at as "lockedAt", error,
      created_at as "createdAt", finished_at as "finishedAt"
  `);
  return rows.rows[0] ?? null;
}

export async function completeJob(db: Db, id: number): Promise<void> {
  await db.update(jobs).set({ status: "done", finishedAt: new Date(), error: null }).where(eq(jobs.id, id));
}

/** Re-queues with backoff until the attempts run out, then marks it failed. */
export async function failJob(db: Db, job: JobRow, error: string): Promise<"retry" | "failed"> {
  if (job.attempts < job.maxAttempts) {
    const backoffMs = 1000 * 2 ** (job.attempts - 1);
    await db
      .update(jobs)
      .set({ status: "queued", runAt: new Date(Date.now() + backoffMs), error, lockedBy: null, lockedAt: null })
      .where(eq(jobs.id, job.id));
    return "retry";
  }
  await db.update(jobs).set({ status: "failed", finishedAt: new Date(), error }).where(eq(jobs.id, job.id));
  return "failed";
}

/**
 * A job left `running` longer than this was abandoned by a worker that
 * died mid-way (a power cut, a kill -9). Hand it back to the queue.
 */
export async function requeueStaleJobs(db: Db, olderThanMs = 60_000): Promise<number> {
  const result = await db
    .update(jobs)
    .set({ status: "queued", lockedBy: null, lockedAt: null })
    .where(and(eq(jobs.status, "running"), lt(jobs.lockedAt, new Date(Date.now() - olderThanMs))))
    .returning({ id: jobs.id });
  return result.length;
}

/** How many sync jobs are still waiting, and how many jobs gave up: the admin page's two queue numbers. */
export async function queueCounts(db: Db): Promise<{ pendingSync: number; failed: number }> {
  const [row] = await db.execute<{ pendingsync: string; failed: string }>(sql`
    select
      count(*) filter (where kind = 'sync' and status in ('queued', 'running')) as pendingsync,
      count(*) filter (where status = 'failed') as failed
    from jobs
  `).then((r) => r.rows);
  return { pendingSync: Number(row?.pendingsync ?? 0), failed: Number(row?.failed ?? 0) };
}
