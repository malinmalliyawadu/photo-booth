import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { resetBooth, snapshot, waitForWorker } from "./helpers";

/**
 * The iPad as the camera, in WebKit with Playwright's mock front camera,
 * which is the same engine and the same getUserMedia the booth's iPad
 * runs.
 */

test.beforeEach(async ({ request }) => {
  await waitForWorker(request);
  await resetBooth(request);
  await request.patch("/api/admin/booth", { data: { cameraMode: "ipad" } });
});

test.afterAll(async ({ request }) => {
  await resetBooth(request);
});

test.describe("with the camera allowed", () => {
  test.use({ permissions: ["camera"] });

  test("the iPad takes every photo in a session", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.getByTestId("attract")).toBeVisible();

    // The kiosk opens the camera on load, at the largest size it offers
    // (the mock's default is 640×480), and reports it to the admin page.
    // Wait for the iPad's own report: until it lands, the card still
    // holds the fake camera's "ok" from before the switch.
    const reported = /^Mock video device.* at (\d+)×(\d+)$/;
    await expect.poll(async () => (await snapshot(request)).components.camera).toMatchObject({ status: "ok", detail: expect.stringMatching(reported) });
    const detail = (await snapshot(request)).components.camera!.detail;
    const [, width, height] = detail.match(reported)!.map(Number);
    expect(width! * height!).toBeGreaterThan(640 * 480);

    const s = await snapshot(request);
    const layout = s.templates.find((t) => t.active && t.shotCount === 4)!;
    await page.getByTestId("attract").click();
    await page.getByTestId(`layout-${layout.id}`).click();
    await expect(page.getByTestId("live")).toBeVisible();

    // What the guest sees is the slot's shape, not the camera's.
    const slot = layout.slots.find((sl) => sl.shot === 1)!;
    const crop = await page.getByTestId("viewfinder-crop").boundingBox();
    expect(crop!.width / crop!.height).toBeCloseTo(slot.width / slot.height, 1);

    await expect(page.getByTestId("review")).toBeVisible({ timeout: 30_000 });
    const reviewed = await snapshot(request);
    expect(reviewed.session?.shots).toHaveLength(4);

    // The shots are the camera's full frames, not the cropped preview.
    for (const shot of reviewed.session!.shots) {
      const res = await request.get(shot.url);
      expect(res.headers()["content-type"]).toBe("image/jpeg");
      const meta = await sharp(await res.body()).metadata();
      expect([meta.width, meta.height]).toEqual([width, height]);
    }
  });
});

test("a blocked camera fails the session quickly and says why", async ({ page, request }) => {
  await page.goto("/");
  await expect
    .poll(async () => (await snapshot(request)).components.camera)
    .toMatchObject({ status: "error", detail: expect.stringMatching(/not allowed to use the camera/) });

  const s = await snapshot(request);
  const layout = s.templates.find((t) => t.active && t.shotCount === 1)!;
  await page.getByTestId("attract").click();
  await page.getByTestId(`layout-${layout.id}`).click();
  await expect(page.getByTestId("camera-error")).toBeVisible();

  // Three attempts, each reported as soon as it fails rather than after
  // the 20 s capturing timeout.
  await expect(page.getByTestId("ended")).toBeVisible({ timeout: 20_000 });
  const after = await snapshot(request);
  expect(after.recent[0]?.phase).toBe("failed");
  expect(after.recent[0]?.reason).toMatch(/^iPad camera:/);
});
