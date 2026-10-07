import { expect, type APIRequestContext } from "@playwright/test";
import type { Snapshot } from "@booth/db";

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
    data: { paused: false, cameraMode: "fake", countdownSeconds: 1, lockedTemplateId: null, paperLeft: 36 },
  });
}
