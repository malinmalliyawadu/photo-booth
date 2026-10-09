import { planSync, printBlocker, type Camera, type CameraMode, type Phase } from "@booth/core";
import {
  applySessionEvent,
  consumePrint,
  countPrint,
  db,
  ensureDir,
  getSession,
  markSynced,
  readBooth,
  recordShot,
  resolveData,
  sessionPaths,
  updateBooth,
  type JobRow,
  type SessionRow,
} from "@booth/db";
import { composeSession } from "./compositor";
import type { Gallery } from "./gallery";
import { PrintFailure, type Printer } from "./printer";

export interface Services {
  camera: (mode: CameraMode) => Promise<Camera | null>;
  printer: Printer;
  gallery: Gallery;
  log: (msg: string) => void;
}

type Handler = (job: JobRow, services: Services) => Promise<void>;

function sessionOf(job: JobRow): string {
  if (!job.sessionId) throw new Error(`${job.kind} job ${job.id} has no session`);
  return job.sessionId;
}

const countdown: Handler = async (job) => {
  const shot = Number(job.payload.shot);
  await applySessionEvent(sessionOf(job), { type: "countdown_elapsed", shot });
};

/**
 * Takes the shot, or in iPad mode leaves it to the kiosk. A failure is a
 * state machine event rather than a job retry: the session decides
 * whether to count down again or give up.
 */
const capture: Handler = async (job, services) => {
  const id = sessionOf(job);
  const shot = Number(job.payload.shot);
  const settings = await readBooth(db);
  const camera = await services.camera(settings.cameraMode);
  if (!camera) {
    services.log(`session ${id} shot ${shot}: waiting for the iPad to upload`);
    return;
  }
  try {
    await ensureDir(sessionPaths.dir(id));
    const rel = sessionPaths.shot(id, shot);
    await camera.shoot(resolveData(rel));
    const result = await recordShot(id, shot, rel);
    if (!result.ok) services.log(`session ${id} shot ${shot}: ${result.reason}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    services.log(`session ${id} shot ${shot} failed: ${reason}`);
    await applySessionEvent(id, { type: "shot_failed", shot, reason });
  }
};

const timeout: Handler = async (job) => {
  await applySessionEvent(sessionOf(job), {
    type: "timed_out",
    phase: job.payload.phase as Phase,
    shot: Number(job.payload.shot),
  });
};

/**
 * The guest accepted (or walked away from) the review: the look and the
 * mirror are settled, so the print, web and thumbnail JPEGs are made
 * now, and the print and the gallery upload follow from `composed`. A
 * failure is retried by the queue; the last one fails the session, so
 * the kiosk says so instead of waiting out the timeout.
 */
const compose: Handler = async (job, services) => {
  const id = sessionOf(job);
  const session = await getSession(id);
  if (!session || session.deletedAt || session.phase !== "composing") return;
  const started = Date.now();
  try {
    await composeSession(id);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (job.attempts < job.maxAttempts) throw err;
    services.log(`session ${id}: compose failed: ${reason}`);
    await applySessionEvent(id, { type: "compose_failed", reason: `The photos could not be put together: ${reason}` });
    return;
  }
  services.log(`session ${id}: composed in ${Date.now() - started} ms`);
  await applySessionEvent(id, { type: "composed" });
};

/**
 * The session's files, composing them first if it has none: a session
 * from before the compositor, or one it failed on, reprinted or sent
 * again from the admin page.
 */
async function composed(session: SessionRow, services: Services): Promise<SessionRow> {
  if (session.compositePath && session.webPath && session.thumbPath) return session;
  if (session.takenCount < session.shotCount) throw new Error("the session has no photos to put together");
  services.log(`session ${session.id}: composing on demand`);
  const paths = await composeSession(session.id);
  return { ...session, ...paths };
}

/**
 * One postcard. Runs in its own lane (see main.ts), because a print
 * takes most of a minute and the next guest's countdown must not wait
 * behind it. An empty tray or a spent cassette, by the counters, skips
 * the print rather than fail it, so the kiosk says "needs a refill"
 * rather than "something went wrong".
 */
const print: Handler = async (job, services) => {
  const id = sessionOf(job);
  const reprint = job.payload.reprint === true;
  const session = await getSession(id);
  if (!session || session.deletedAt) return;

  if (!reprint) await applySessionEvent(id, { type: "print_started" });
  const settings = await readBooth(db);
  const blocker = printBlocker(settings);
  if (blocker) {
    services.log(`session ${id}: print skipped: ${blocker}`);
    // A reprint has no session phase to say so; the failed job does, on the admin page.
    if (reprint) throw new Error(blocker);
    await applySessionEvent(id, { type: "print_skipped", reason: blocker });
    return;
  }
  try {
    const { compositePath } = await composed(session, services);
    await services.printer.print(resolveData(compositePath!), `Booth ${id}`);
    await consumePrint(db);
    await countPrint(id);
    if (!reprint) await applySessionEvent(id, { type: "printed" });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    services.log(`session ${id}: print failed: ${reason}`);
    // The printer knows better than the count: the next guests' prints
    // are skipped with "needs a refill" until the attendant says it is done.
    if (err instanceof PrintFailure && err.empty) await updateBooth(err.empty === "paper" ? { paperLeft: 0 } : { inkLeft: 0 });
    if (!reprint) await applySessionEvent(id, { type: "print_failed", reason });
    else throw err;
  }
};

/**
 * Sends the composed photo to the gallery (`gallery.ts`). A session is
 * `synced` only once the gallery has said yes; with no gallery
 * configured it never is, and the admin page says so rather than
 * pretending. Failures are the queue's to retry: the guest already has
 * their print and their QR, and the page behind the QR fills in when
 * this catches up.
 */
const sync: Handler = async (job, services) => {
  const id = sessionOf(job);
  let session = await getSession(id);
  if (!session) return;
  let plan = planSync(services.gallery.setting, session);
  if (plan.kind === "compose") {
    session = await composed(session, services);
    plan = planSync(services.gallery.setting, session);
  }
  switch (plan.kind) {
    case "skip":
      services.log(`session ${id}: not sent to the gallery: ${plan.reason}`);
      return;
    case "fail":
      throw new Error(plan.reason);
    case "compose":
      throw new Error("the session's photos were put together but not recorded");
    case "upload": {
      const { url } = await services.gallery.upload({
        id,
        takenAt: session.createdAt,
        photo: resolveData(plan.photo),
        thumb: resolveData(plan.thumb),
      });
      await markSynced(id);
      services.log(`session ${id}: in the gallery at ${url}`);
    }
  }
};

export const handlers: Record<JobRow["kind"], Handler> = {
  countdown,
  capture,
  timeout,
  compose,
  print,
  sync,
};
