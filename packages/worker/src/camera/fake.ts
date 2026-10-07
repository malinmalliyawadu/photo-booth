import { copyFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Camera, CameraStatus } from "@booth/core";

const SAMPLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples");

/**
 * Returns the sample photos in turn, with a short pause so the kiosk's
 * "hold still" moment is visible. Lets the whole booth be built and
 * hallway-tested with no hardware in the room.
 */
export class FakeCamera implements Camera {
  readonly kind = "fake" as const;
  private samples: string[] = [];
  private next = 0;
  private started = false;

  constructor(private readonly shutterMs = 600) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.samples = (await readdir(SAMPLES_DIR)).filter((f) => f.endsWith(".jpg")).sort();
    if (this.samples.length === 0) throw new Error(`No sample photos in ${SAMPLES_DIR}: run \`pnpm assets\``);
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  async shoot(destPath: string): Promise<void> {
    if (!this.started) await this.start();
    await new Promise((r) => setTimeout(r, this.shutterMs));
    const sample = this.samples[this.next % this.samples.length]!;
    this.next++;
    await copyFile(path.join(SAMPLES_DIR, sample), destPath);
  }

  status(): CameraStatus {
    return {
      ok: this.started,
      detail: this.started ? `Fake camera, ${this.samples.length} sample photos` : "Fake camera, not started",
    };
  }
}
