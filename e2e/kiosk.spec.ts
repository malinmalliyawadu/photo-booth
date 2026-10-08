import { expect, test } from "@playwright/test";
import { resetBooth, snapshot, waitForWorker } from "./helpers";

test.beforeEach(async ({ request }) => {
  await waitForWorker(request);
  await resetBooth(request);
});

test.afterAll(async ({ request }) => {
  await resetBooth(request);
});

test("a guest walks the booth from tap to QR", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByTestId("attract")).toBeVisible();

  await page.getByTestId("attract").click();
  await expect(page.getByTestId("picker")).toBeVisible();

  const before = await snapshot(request);
  const layout = before.templates.find((t) => t.active && t.shotCount === 4);
  expect(layout, "the seeded two-by-two layout").toBeDefined();
  await page.getByTestId(`layout-${layout!.id}`).click();

  // Four shots, each announced, with the fake camera and a 1 s countdown.
  const live = page.getByTestId("live");
  await expect(live).toBeVisible();
  for (let shot = 1; shot <= 4; shot++) {
    await expect(page.getByTestId("shot-label")).toHaveText(`Photo ${shot} of 4`);
    await expect(page.getByTestId("hold-still")).toBeVisible();
  }

  await expect(page.getByTestId("review")).toBeVisible();
  const reviewed = await snapshot(request);
  expect(reviewed.session?.phase).toBe("review");
  expect(reviewed.session?.shots).toHaveLength(4);

  await page.getByTestId("accept").click();
  await expect(page.getByTestId("deliver")).toBeVisible();
  await expect(page.getByTestId("qr")).toBeVisible();
  await expect(page.getByTestId("print-status")).toHaveText(/in the tray/);

  const delivered = await snapshot(request);
  expect(delivered.session?.print).toBe("printed");
  expect(delivered.booth.paperLeft).toBe(35);

  await page.getByTestId("done").click();
  await expect(page.getByTestId("attract")).toBeVisible();

  const after = await snapshot(request);
  expect(after.session).toBeNull();
  expect(after.recent[0]?.id).toBe(reviewed.session!.id);
  expect(after.recent[0]?.phase).toBe("done");
});

test("starting over returns to the attract loop", async ({ page, request }) => {
  await page.goto("/");
  await page.getByTestId("attract").click();
  const s = await snapshot(request);
  const layout = s.templates.find((t) => t.active)!;
  await page.getByTestId(`layout-${layout.id}`).click();
  await expect(page.getByTestId("live")).toBeVisible();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByTestId("attract")).toBeVisible();
  const after = await snapshot(request);
  expect(after.session).toBeNull();
  expect(after.recent[0]?.phase).toBe("abandoned");
});

test("a paused booth tells the guest to come back", async ({ page, request }) => {
  await request.patch("/api/admin/booth", { data: { paused: true } });
  await page.goto("/");
  await expect(page.getByTestId("paused")).toBeVisible();
  await request.patch("/api/admin/booth", { data: { paused: false } });
  await expect(page.getByTestId("attract")).toBeVisible();
});

test("a locked layout skips the picker", async ({ page, request }) => {
  const s = await snapshot(request);
  const layout = s.templates.find((t) => t.active && t.shotCount === 1)!;
  await request.patch("/api/admin/booth", { data: { lockedTemplateId: layout.id } });
  await page.goto("/");
  await page.getByTestId("attract").click();
  await expect(page.getByTestId("live")).toBeVisible();
  await expect(page.getByTestId("shot-label")).toHaveText("Photo 1 of 1");
  await expect(page.getByTestId("review")).toBeVisible();
});
