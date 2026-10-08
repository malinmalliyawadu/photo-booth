import { planSync, type Camera, type CameraMode, type Phase } from "@booth/core";
import {
  applySessionEvent,
  consumePaper,
  countPrint,
  db,
  ensureDir,
  getSession,
  markSynced,
  readBooth,
  recordShot,
  resolveData,
  sessionPaths,
  shotPath,
  type JobRow,
} from "@booth/db";
import type { Gallery } from "./gallery";
import type { Printer } from "./printer";

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
 * Phase 2 puts sharp behind this. Until then the kiosk lays the shots
 * under the template overlay itself, so there is nothing to produce.
 */
const compose: Handler = async (job) => {
  await applySessionEvent(sessionOf(job), { type: "composed" });
};

const print: Handler = async (job, services) => {
  const id = sessionOf(job);
  const reprint = job.payload.reprint === true;
  const session = await getSession(id);
  if (!session || session.deletedAt) return;

  if (!reprint) await applySessionEvent(id, { type: "print_started" });
  const settings = await readBooth(db);
  if (settings.paperLeft <= 0) {
    services.log(`session ${id}: no paper, print skipped`);
    if (!reprint) await applySessionEvent(id, { type: "print_skipped", reason: "The printer is out of paper" });
    return;
  }
  try {
    // Until the compositor lands there is no print file; the fake
    // printer does not mind being handed the first shot.
    const file = session.compositePath ?? (await shotPath(id, 1));
    if (!file) throw new Error("the session has no photo to print");
    await services.printer.print(resolveData(file));
    await consumePaper(db);
    await countPrint(id);
    if (!reprint) await applySessionEvent(id, { type: "printed" });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    services.log(`session ${id}: print failed: ${reason}`);
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
  const session = await getSession(id);
  if (!session) return;
  const plan = planSync(services.gallery.setting, session);
  switch (plan.kind) {
    case "skip":
      services.log(`session ${id}: not sent to the gallery: ${plan.reason}`);
      return;
    case "fail":
      throw new Error(plan.reason);
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
