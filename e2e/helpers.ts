import { readFile } from "node:fs/promises";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { Snapshot } from "@booth/db";

/** The whole catalogue, as the booth offers it after a reset. */
export const ALL_FILTERS = ["colour", "mono", "vintage", "faded", "pop"] as const;
export const ALL_PROPS = ["crown", "flowers", "tophat", "hearts", "specs", "moustache"] as const;

export async function snapshot(request: APIRequestContext): Promise<Snapshot> {
  const res = await request.get("/api/snapshot");
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as Snapshot;
}

/** Signs in to admin and returns nothing; the cookie lives on the context. */
export async function signInAdmin(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/admin/login", { data: { password: process.env.ADMIN_PASSWORD ?? "e2e-password" } });
  expect(res.ok(), "admin sign-in (is ADMIN_PASSWORD set?)").toBeTruthy();
}

/** Waits for the worker heartbeat, which is what proves the whole stack is up. */
export async function waitForWorker(request: APIRequestContext): Promise<void> {
  await expect
    .poll(
      async () => {
        const s = await snapshot(request);
        const seen = s.components.worker?.seenAt;
        return s.components.worker?.status === "ok" && seen !== undefined && Date.now() - new Date(seen).getTime() < 15_000;
      },
      { timeout: 30_000, message: "the worker never reported in" },
    )
    .toBe(true);
}

/** Leaves the booth idle: cancels an active session and resets the settings the tests touch. */
export async function resetBooth(request: APIRequestContext): Promise<void> {
  await signInAdmin(request);
  const s = await snapshot(request);
  if (s.session) await request.post(`/api/sessions/${s.session.id}/cancel`);
  await request.patch("/api/admin/booth", {
    data: {
      paused: false,
      cameraMode: "fake",
      countdownSeconds: 1,
      lockedTemplateId: null,
      paperLeft: 18,
      inkLeft: 36,
      filters: [...ALL_FILTERS],
      props: [...ALL_PROPS],
    },
  });
}

/**
 * Shows the kiosk a photo as its front camera: getUserMedia answers with
 * a canvas stream of the picture, redrawn so it keeps producing frames,
 * at the picture's own size. Playwright's mock camera shows no face, and
 * the props need one.
 */
export async function photoAsCamera(page: Page, file: string): Promise<void> {
  const url = `data:image/jpeg;base64,${(await readFile(file)).toString("base64")}`;
  await page.addInitScript((src: string) => {
    const open = async () => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      const draw = () => ctx.drawImage(img, 0, 0);
      draw();
      setInterval(draw, 100);
      return canvas.captureStream(10);
    };
    // On the prototype: WebKit hands out navigator.mediaDevices lazily, and an own property set this early does not stick.
    MediaDevices.prototype.getUserMedia = open;
  }, url);
}
