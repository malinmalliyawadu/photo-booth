/**
 * The booth worker: one loop over one jobs table.
 *
 * Claims the next due job with SKIP LOCKED, runs its handler, marks it
 * done or re-queues it with backoff. Postgres NOTIFY wakes the loop the
 * moment a job is queued; a short poll catches jobs whose time has come
 * and anything a missed notification would have lost. Every few seconds
 * it reports its own health and the camera's and printer's, which is
 * what the admin page shows.
 */
import { hostname } from "node:os";
import { Client } from "pg";
import { gallerySetting, type Camera, type CameraMode } from "@booth/core";
import {
  CHANNEL,
  claimJob,
  completeJob,
  db,
  failJob,
  pool,
  readBooth,
  reportComponent,
  requeueStaleJobs,
  runMigrations,
  seed,
} from "@booth/db";
import { cameraFor } from "./camera";
import { galleryFor } from "./gallery";
import { startHttp } from "./http";
import { handlers, type Services } from "./handlers";
import { printerFor } from "./printer";

const WORKER_ID = `${hostname()}:${process.pid}`;
const POLL_MS = 250;
const HEARTBEAT_MS = 5000;
// Not PORT: that is the app's, and a launcher that sets it for the whole
// `pnpm dev` tree (the desktop app's preview does) would put the worker
// on the app's port.
const HTTP_PORT = Number(process.env.WORKER_PORT ?? 3101);

const log = (msg: string) => console.log(`[worker] ${new Date().toISOString()} ${msg}`);

/**
 * Holds the camera for the current mode and swaps it when the attendant
 * switches modes on the admin page, releasing the USB device first.
 */
class CameraManager {
  private current: { mode: CameraMode; camera: Camera | null } | null = null;
  private lastError: string | null = null;

  async for(mode: CameraMode): Promise<Camera | null> {
    if (this.current?.mode === mode) return this.current.camera;
    await this.current?.camera?.stop();
    try {
      const camera = cameraFor(mode);
      await camera?.start();
      this.current = { mode, camera };
      this.lastError = null;
      log(`camera: ${mode}${camera ? ` (${camera.status().detail})` : " (the kiosk captures)"}`);
      return camera;
    } catch (err) {
      this.current = { mode, camera: null };
      this.lastError = err instanceof Error ? err.message : String(err);
      log(`camera: ${mode} failed: ${this.lastError}`);
      return null;
    }
  }

  /** Null in iPad mode: the kiosk reports that camera's health itself. */
  status(): { status: "ok" | "warn" | "error" | "off"; detail: string } | null {
    if (!this.current) return { status: "off", detail: "Not started" };
    if (this.lastError) return { status: "error", detail: this.lastError };
    if (this.current.mode === "ipad") return null;
    if (!this.current.camera) return { status: "off", detail: "No camera" };
    const s = this.current.camera.status();
    return { status: s.ok ? "ok" : "error", detail: s.detail };
  }

  async stop() {
    await this.current?.camera?.stop();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (see .env.example)");
  // Migrations then the seed, both idempotent, so a fresh database (a
  // new controller, a container on Coolify) comes up with no manual step.
  await runMigrations();
  await seed();

  const cameras = new CameraManager();
  const printer = printerFor(process.env.BOOTH_PRINTER);
  const gallery = galleryFor(gallerySetting(process.env));
  log(
    gallery.setting.kind === "on"
      ? `gallery: ${gallery.setting.host}`
      : gallery.setting.kind === "off"
        ? "gallery: none configured, sessions stay on the booth"
        : `gallery: ${gallery.setting.detail}`,
  );
  const services: Services = { camera: (mode) => cameras.for(mode), printer, gallery, log };

  const startedAt = new Date();
  const http = startHttp(HTTP_PORT, () => ({ worker: WORKER_ID, since: startedAt.toISOString(), camera: cameras.status() ?? { status: "kiosk", detail: "The iPad reports its own camera" } }));

  const requeued = await requeueStaleJobs(db, 0);
  if (requeued) log(`re-queued ${requeued} job(s) left running by a previous worker`);

  // Wake-ups: a dedicated client holds LISTEN for the life of the process.
  let wake: (() => void) | null = null;
  const listener = new Client({ connectionString: process.env.DATABASE_URL });
  await listener.connect();
  await listener.query(`listen ${CHANNEL}`);
  listener.on("notification", () => wake?.());
  listener.on("error", (err) => log(`listener error: ${err.message}`));

  let running = true;
  const stop = async () => {
    if (!running) return;
    running = false;
    log("stopping");
    wake?.();
    clearInterval(heartbeat);
    await reportComponent(db, "worker", "off", "Stopped");
    await cameras.stop();
    http.close();
    await listener.end();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const beat = async () => {
    try {
      const settings = await readBooth(db);
      await cameras.for(settings.cameraMode);
      const cam = cameras.status();
      const [prn, gal] = await Promise.all([printer.status(), gallery.status()]);
      await Promise.all([
        reportComponent(db, "worker", "ok", `Running on ${hostname()}`),
        cam && reportComponent(db, "camera", cam.status, cam.detail),
        reportComponent(db, "printer", prn.ok ? "ok" : "error", prn.detail),
        reportComponent(db, "sync", gal.status, gal.detail),
      ]);
    } catch (err) {
      log(`heartbeat failed: ${err instanceof Error ? err.message : err}`);
    }
  };
  await beat();
  const heartbeat = setInterval(beat, HEARTBEAT_MS);
  log(`started as ${WORKER_ID}`);

  while (running) {
    let job = null;
    try {
      job = await claimJob(db, WORKER_ID);
    } catch (err) {
      log(`claim failed: ${err instanceof Error ? err.message : err}`);
    }
    if (!job) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, POLL_MS);
        wake = () => {
          clearTimeout(t);
          resolve();
        };
      });
      wake = null;
      continue;
    }
    const started = Date.now();
    try {
      await handlers[job.kind](job, services);
      await completeJob(db, job.id);
      log(`${job.kind} #${job.id}${job.sessionId ? ` ${job.sessionId}` : ""} done in ${Date.now() - started} ms`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const outcome = await failJob(db, job, message);
      log(`${job.kind} #${job.id} ${outcome}: ${message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
