/**
 * The booth's side of the gallery sync: one multipart POST per finished
 * session to the event's own site (see `gallery.ts` in core for what
 * the gallery is and why the booth does not host one).
 *
 * What goes over the wire, so a gallery can be written against it:
 *
 *   POST {GALLERY_SYNC_URL}
 *   Authorization: Bearer {GALLERY_SYNC_TOKEN}
 *   multipart/form-data:
 *     session  the session's short ID; the gallery keys on it, so a
 *              retry or a resend replaces rather than duplicates
 *     takenAt  ISO 8601, when the session began
 *     width, height  of `photo`, in pixels
 *     photo    the web JPEG
 *     thumb    the thumbnail JPEG
 *
 *   200 {"id": ..., "url": "/i/booth/{session}"}  or any 4xx/5xx with
 *   {"error": "..."}; anything but 2xx is a failed job, retried with
 *   backoff by the queue.
 *
 *   GET {GALLERY_SYNC_URL} with the same header answers 200 when the
 *   gallery is up and the token is right; the heartbeat asks once a
 *   minute so the admin page can say so before the first session.
 */
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import type { GallerySetting } from "@booth/core";
import type { ComponentStatus } from "@booth/db";

const UPLOAD_TIMEOUT_MS = 90_000;
const PING_TIMEOUT_MS = 10_000;
/** How often the heartbeat asks the gallery whether it is there. */
export const PING_EVERY_MS = 60_000;

export interface GalleryUpload {
  /** The session's short ID. */
  id: string;
  takenAt: Date;
  /** Absolute paths. */
  photo: string;
  thumb: string;
}

export interface Gallery {
  readonly setting: GallerySetting;
  upload(upload: GalleryUpload): Promise<{ url: string }>;
  /** For the `sync` component on the admin page; asks the gallery at most every `PING_EVERY_MS`. */
  status(): Promise<{ status: ComponentStatus; detail: string }>;
}

export function galleryFor(setting: GallerySetting, fetchImpl: typeof fetch = fetch): Gallery {
  if (setting.kind !== "on") {
    return {
      setting,
      upload: async () => {
        throw new Error(setting.kind === "off" ? "no gallery is configured" : setting.detail);
      },
      status: async () =>
        setting.kind === "off"
          ? { status: "off", detail: "No gallery: set GALLERY_SYNC_URL and GALLERY_SYNC_TOKEN to send photos somewhere" }
          : { status: "error", detail: setting.detail },
    };
  }

  // A narrowed name the hoisted `ping` below can see; `setting` itself
  // is only narrowed within this block.
  const target = setting;
  const headers = { Authorization: `Bearer ${target.token}` };
  let lastError: string | null = null;
  let lastPing: { at: number; result: { status: ComponentStatus; detail: string } } | null = null;

  return {
    setting,

    async upload({ id, takenAt, photo, thumb }) {
      const [photoBytes, thumbBytes] = await Promise.all([readFile(photo), readFile(thumb)]);
      const { width, height } = await sharp(photoBytes).metadata();
      if (!width || !height) throw new Error(`${photo} is not an image the gallery can take`);

      const form = new FormData();
      form.set("session", id);
      form.set("takenAt", takenAt.toISOString());
      form.set("width", String(width));
      form.set("height", String(height));
      form.set("photo", new Blob([photoBytes], { type: "image/jpeg" }), `${id}.jpg`);
      form.set("thumb", new Blob([thumbBytes], { type: "image/jpeg" }), `${id}-thumb.jpg`);

      let res: Response;
      try {
        res = await fetchImpl(target.url, { method: "POST", headers, body: form, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
      } catch (err) {
        lastError = `${target.host} did not answer: ${err instanceof Error ? err.message : String(err)}`;
        throw new Error(lastError);
      }
      if (!res.ok) {
        lastError = `${target.host} answered ${res.status}: ${await errorText(res)}`;
        throw new Error(lastError);
      }
      lastError = null;
      const body = (await res.json().catch(() => ({}))) as { url?: unknown };
      return { url: typeof body.url === "string" ? new URL(body.url, target.url).toString() : target.url };
    },

    async status() {
      const now = Date.now();
      if (!lastPing || now - lastPing.at >= PING_EVERY_MS) {
        lastPing = { at: now, result: await ping() };
      }
      // A gallery that is down or refusing the token is the better
      // explanation of a failed upload than the failure itself.
      if (lastPing.result.status !== "ok") return lastPing.result;
      if (lastError) return { status: "warn", detail: `Last upload failed: ${lastError}` };
      return lastPing.result;
    },
  };

  async function ping(): Promise<{ status: ComponentStatus; detail: string }> {
    try {
      const res = await fetchImpl(target.url, { method: "GET", headers, signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
      if (res.ok) return { status: "ok", detail: `Sending photos to ${target.host}` };
      if (res.status === 401) return { status: "error", detail: `${target.host} refuses the token (GALLERY_SYNC_TOKEN)` };
      return { status: "error", detail: `${target.host} answered ${res.status}: ${await errorText(res)}` };
    } catch (err) {
      return { status: "error", detail: `${target.host} did not answer: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

/** The gallery's `{"error": ...}` if it sent one, else the start of whatever it did send. */
async function errorText(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    /* not JSON */
  }
  return text.replace(/\s+/g, " ").slice(0, 120) || res.statusText || "no detail";
}
