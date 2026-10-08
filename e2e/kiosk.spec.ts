import { expect, test } from "@playwright/test";
import { ALL_FILTERS, resetBooth, snapshot, waitForWorker } from "./helpers";

test.beforeEach(async ({ request }) => {
  await waitForWorker(request);
  await resetBooth(request);
});

test.afterAll(async ({ request }) => {
  await resetBooth(request);
});

const MONO_CSS = "grayscale(1) contrast(1.08) brightness(1.02)";
/** scaleX(-1), as the browser reports it. */
const MIRROR_CSS = "matrix(-1, 0, 0, 1, 0, 0)";

test("a guest walks the booth from tap to QR", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByTestId("attract")).toBeVisible();

  await page.getByTestId("attract").click();
  await expect(page.getByTestId("picker")).toBeVisible();

  const before = await snapshot(request);
  expect(before.booth.filters).toEqual([...ALL_FILTERS]);
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
  expect(reviewed.session?.filter).toBe("colour");

  // Every filter on offer is a chip; the one chosen is on the photos as
  // drawn, not on the overlay and not in the files.
  for (const id of ALL_FILTERS) await expect(page.getByTestId(`filter-${id}`)).toBeVisible();
  await expect(page.getByTestId("filter-colour")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("filter-mono").click();
  await expect(page.getByTestId("filter-mono")).toHaveAttribute("aria-checked", "true");
  const photo = page.getByTestId("review").locator(`img[src="${reviewed.session!.shots[0]!.url}"]`).first();
  const overlay = page.getByTestId("review").locator(`img[src="${layout!.screenUrl}"]`);
  await expect(photo).toHaveCSS("filter", MONO_CSS);
  await expect(overlay).toHaveCSS("filter", "none");
  await expect.poll(async () => (await snapshot(request)).session?.filter).toBe("mono");

  // Flipping is the same kind of choice: a switch beside the chips, a
  // transform on the photos as drawn, nothing on the overlay or the files.
  expect(reviewed.session?.mirrored).toBe(false);
  await expect(photo).toHaveCSS("transform", "none");
  await expect(page.getByTestId("mirror")).toHaveAttribute("aria-checked", "false");
  await page.getByTestId("mirror").click();
  await expect(page.getByTestId("mirror")).toHaveAttribute("aria-checked", "true");
  await expect(photo).toHaveCSS("transform", MIRROR_CSS);
  await expect(photo).toHaveCSS("filter", MONO_CSS);
  await expect(overlay).toHaveCSS("transform", "none");
  await expect.poll(async () => (await snapshot(request)).session?.mirrored).toBe(true);

  await page.getByTestId("accept").click();
  await expect(page.getByTestId("deliver")).toBeVisible();
  await expect(page.getByTestId("qr")).toBeVisible();

  // The QR screen shows the compositor's JPEG, the one that was printed
  // and goes to the gallery: the look and the mirror are in its pixels,
  // not drawn over it.
  const composedSession = (await snapshot(request)).session!;
  expect(composedSession.webUrl).toMatch(/\/web-[0-9a-f]+\.jpg$/);
  const composed = page.getByTestId("deliver").getByTestId("composed");
  await expect(composed).toHaveAttribute("src", composedSession.webUrl!);
  await expect(composed).toHaveCSS("filter", "none");
  await expect(composed).toHaveCSS("transform", "none");
  await expect.poll(() => composed.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByTestId("deliver").locator(`img[src="${reviewed.session!.shots[0]!.url}"]`)).toHaveCount(0);
  for (const url of [composedSession.compositeUrl, composedSession.webUrl, composedSession.thumbUrl]) {
    const res = await request.get(url!);
    expect(res.status(), url!).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/jpeg");
  }
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
  expect(after.recent[0]?.filter).toBe("mono");
  expect(after.recent[0]?.mirrored).toBe(true);
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

test("a filter and the mirror survive a retake, and one filter on offer asks nothing", async ({ page, request }) => {
  await page.goto("/");
  await page.getByTestId("attract").click();
  const s = await snapshot(request);
  const layout = s.templates.find((t) => t.active && t.shotCount === 1)!;
  await page.getByTestId(`layout-${layout.id}`).click();
  await expect(page.getByTestId("review")).toBeVisible();
  await page.getByTestId("filter-vintage").click();
  await expect.poll(async () => (await snapshot(request)).session?.filter).toBe("vintage");
  await page.getByTestId("mirror").click();
  await expect.poll(async () => (await snapshot(request)).session?.mirrored).toBe(true);

  // The retake is posed through the chosen look and comes back with it,
  // and the mirror is kept too.
  await page.getByRole("button", { name: "Retake" }).click();
  await expect(page.getByTestId("live")).toHaveAttribute("data-filter", "vintage");
  await expect(page.getByTestId("live")).toHaveAttribute("data-mirrored", "true");
  await expect(page.getByTestId("review")).toBeVisible();
  await expect(page.getByTestId("review")).toHaveAttribute("data-filter", "vintage");
  await expect(page.getByTestId("filter-vintage")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("mirror")).toHaveAttribute("aria-checked", "true");

  // The attendant narrows the offer to one: the chips go, the mirror
  // switch stays, the session keeps what it has, and the next session
  // gets that one filter.
  await request.patch("/api/admin/booth", { data: { filters: ["mono"] } });
  await expect(page.getByTestId("filters")).toHaveCount(0);
  await expect(page.getByTestId("mirror")).toBeVisible();
  await expect(page.getByTestId("review")).toHaveAttribute("data-filter", "vintage");
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByTestId("attract")).toBeVisible();
  await page.getByTestId("attract").click();
  await page.getByTestId(`layout-${layout.id}`).click();
  await expect(page.getByTestId("live")).toHaveAttribute("data-filter", "mono");
  await expect(page.getByTestId("review")).toBeVisible();
  await expect(page.getByTestId("filters")).toHaveCount(0);
  expect((await snapshot(request)).session?.filter).toBe("mono");
});

test("the API refuses a filter the booth does not offer, or a filter or mirror chosen too late", async ({ request }) => {
  await request.patch("/api/admin/booth", { data: { filters: ["pop", "colour", "colour"] } });
  // Stored tidy: catalogue order, no duplicates.
  expect((await snapshot(request)).booth.filters).toEqual(["colour", "pop"]);
  const none = await request.patch("/api/admin/booth", { data: { filters: [] } });
  expect(none.status()).toBe(400);

  const layout = (await snapshot(request)).templates.find((t) => t.active && t.shotCount === 1)!;
  const started = await request.post("/api/sessions", { data: { templateId: layout.id } });
  expect(started.status()).toBe(201);
  const { id } = (await started.json()) as { id: string };

  // Too early: the photo is not taken yet.
  const early = await request.post(`/api/sessions/${id}/filter`, { data: { filter: "pop" } });
  expect(early.status()).toBe(409);
  const earlyMirror = await request.post(`/api/sessions/${id}/mirror`, { data: { mirrored: true } });
  expect(earlyMirror.status()).toBe(409);
  await expect.poll(async () => (await snapshot(request)).session?.phase, { timeout: 20_000 }).toBe("review");

  const refused = await request.post(`/api/sessions/${id}/filter`, { data: { filter: "mono" } });
  expect(refused.status()).toBe(400);
  expect(((await refused.json()) as { error: string }).error).toMatch(/not offered/);
  const unknown = await request.post(`/api/sessions/${id}/filter`, { data: { filter: "sepia" } });
  expect(unknown.status()).toBe(400);
  const ok = await request.post(`/api/sessions/${id}/filter`, { data: { filter: "pop" } });
  expect(ok.status()).toBe(200);
  expect((await snapshot(request)).session?.filter).toBe("pop");
  const notABoolean = await request.post(`/api/sessions/${id}/mirror`, { data: { mirrored: "yes" } });
  expect(notABoolean.status()).toBe(400);
  const flipped = await request.post(`/api/sessions/${id}/mirror`, { data: { mirrored: true } });
  expect(flipped.status()).toBe(200);
  expect((await snapshot(request)).session?.mirrored).toBe(true);

  // Too late: the print is on its way.
  await request.post(`/api/sessions/${id}/accept`);
  const late = await request.post(`/api/sessions/${id}/filter`, { data: { filter: "colour" } });
  expect(late.status()).toBe(409);
  const lateMirror = await request.post(`/api/sessions/${id}/mirror`, { data: { mirrored: false } });
  expect(lateMirror.status()).toBe(409);
  expect((await snapshot(request)).session).toMatchObject({ filter: "pop", mirrored: true });
});
