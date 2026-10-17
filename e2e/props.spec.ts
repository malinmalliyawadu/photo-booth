import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import sharp from "sharp";
import { ALL_PROPS, photoAsCamera, resetBooth, snapshot, waitForWorker } from "./helpers";

/**
 * The face props, end to end in WebKit: the kiosk's camera is a group
 * portrait of seven (NASA, public domain), MediaPipe finds the faces in
 * the live preview and in the photo taken, the props are drawn on them
 * on every screen, and the compositor puts them in the print's pixels.
 */
const CREW = path.join(import.meta.dirname, "fixtures/crew.jpg");
const CREW_SIZE = { width: 1600, height: 1280 };
const CREW_FACES = 7;

test.beforeEach(async ({ page, request }) => {
  await waitForWorker(request);
  await resetBooth(request);
  await request.patch("/api/admin/booth", { data: { cameraMode: "ipad" } });
  await photoAsCamera(page, CREW);
});

test.afterAll(async ({ request }) => {
  await resetBooth(request);
});

/** The one-photo layout, so a session is one countdown long. */
async function bigShot(request: APIRequestContext) {
  const s = await snapshot(request);
  return s.templates.find((t) => t.active && t.shotCount === 1)!;
}

test("the guests try props on live, pose in them, change them on the review, and get them printed", async ({ page, request }) => {
  const layout = await bigShot(request);
  await page.goto("/");
  await page.getByTestId("attract").click();
  await page.getByTestId(`layout-${layout.id}`).click();

  // Every prop on offer, and none; the first prop is on to start with.
  const props = page.getByTestId("props");
  await expect(props).toBeVisible();
  await expect(props.getByText("Step two of four")).toBeVisible();
  for (const id of ["none", ...ALL_PROPS]) await expect(page.getByTestId(`prop-${id}`)).toBeVisible();
  await expect(page.getByTestId("prop-crown")).toHaveAttribute("aria-checked", "true");

  // Every face in the viewfinder wears one, live.
  await expect(props.getByTestId("prop")).toHaveCount(CREW_FACES, { timeout: 20_000 });
  await page.getByTestId("prop-hearts").click();
  await expect(props).toHaveAttribute("data-prop", "hearts");
  await page.getByTestId("prop-none").click();
  await expect(props.getByTestId("prop")).toHaveCount(0);
  await page.getByTestId("prop-hearts").click();
  await expect(props.getByTestId("prop")).toHaveCount(CREW_FACES);

  // The session starts in them, and the guests pose in them.
  await page.getByTestId("start").click();
  await expect(page.getByTestId("live")).toHaveAttribute("data-prop", "hearts");
  await expect(page.getByTestId("review")).toBeVisible({ timeout: 20_000 });

  // The photo is the camera's own frame; the faces found in it are kept beside it.
  const reviewed = (await snapshot(request)).session!;
  expect(reviewed.prop).toBe("hearts");
  const [shot] = reviewed.shots;
  expect(shot).toMatchObject(CREW_SIZE);
  expect(shot!.faces).toHaveLength(CREW_FACES);
  const original = await sharp(await (await request.get(shot!.url)).body()).metadata();
  expect([original.width, original.height]).toEqual([CREW_SIZE.width, CREW_SIZE.height]);

  // The review draws them on the photos, and offers the props beside the looks.
  const review = page.getByTestId("review");
  await expect(review).toHaveAttribute("data-prop", "hearts");
  await expect(review.getByTestId("composed")).toHaveCount(0);
  await page.getByTestId("tab-props").click();
  await expect(page.getByTestId("prop-hearts")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("prop-crown").click();
  await expect(review).toHaveAttribute("data-prop", "crown");
  await expect.poll(async () => (await snapshot(request)).session?.prop).toBe("crown");
  // A swatch is a close-up of the biggest face wearing the prop; the
  // whole frame is laid out behind it, so its neighbours wear one too.
  await expect(page.getByTestId("prop-crown").getByTestId("prop")).toHaveCount(CREW_FACES);
  await expect(page.getByTestId("prop-none").getByTestId("prop")).toHaveCount(0);

  await page.getByTestId("accept").click();
  await expect(page.getByTestId("deliver")).toBeVisible();
  const delivered = (await snapshot(request)).session!;
  expect(delivered.prop).toBe("crown");

  // The crowns are in the compositor's pixels: the same photo composed
  // with no props differs from it where the crowns are, and only there.
  const withProps = await pixels(request, delivered.webUrl!);
  await page.getByTestId("done").click();
  const plain = await sessionWith(page, request, layout.id, "none");
  const without = await pixels(request, plain.webUrl!);
  expect(withProps.width).toBe(without.width);
  let changed = 0;
  let top = Infinity;
  let bottom = 0;
  for (let i = 0; i < withProps.data.length; i += 3) {
    const d = Math.abs(withProps.data[i]! - without.data[i]!) + Math.abs(withProps.data[i + 1]! - without.data[i + 1]!) + Math.abs(withProps.data[i + 2]! - without.data[i + 2]!);
    if (d > 90) {
      changed++;
      const y = Math.floor(i / 3 / withProps.width);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  const share = changed / (withProps.width * withProps.height);
  expect(share).toBeGreaterThan(0.002);
  expect(share).toBeLessThan(0.1);
  // Above the faces, never down by the flags along the foot.
  expect(bottom / withProps.height).toBeLessThan(0.6);
});

test("a prop the booth does not offer is refused, before posing and on the review", async ({ page, request }) => {
  const layout = await bigShot(request);
  // Stored tidy: catalogue order, no duplicates, and "no props" is always a choice, never a setting.
  await request.patch("/api/admin/booth", { data: { props: ["tophat", "crown", "crown", "none"] } });
  expect((await snapshot(request)).booth.props).toEqual(["crown", "tophat"]);
  expect((await request.patch("/api/admin/booth", { data: { props: ["fez"] } })).status()).toBe(400);

  const refused = await request.post("/api/sessions", { data: { templateId: layout.id, prop: "hearts" } });
  expect(refused.status()).toBe(400);
  const unknown = await request.post("/api/sessions", { data: { templateId: layout.id, prop: "fez" } });
  expect(unknown.status()).toBe(400);

  const started = await request.post("/api/sessions", { data: { templateId: layout.id, prop: "tophat" } });
  expect(started.status()).toBe(201);
  const { id } = (await started.json()) as { id: string };
  // Not while posing: the guests chose before the countdown.
  expect((await request.post(`/api/sessions/${id}/prop`, { data: { prop: "crown" } })).status()).toBe(409);
  await page.goto("/");
  await expect(page.getByTestId("review")).toBeVisible({ timeout: 20_000 });
  expect((await request.post(`/api/sessions/${id}/prop`, { data: { prop: "hearts" } })).status()).toBe(400);
  expect((await request.post(`/api/sessions/${id}/prop`, { data: { prop: "none" } })).status()).toBe(200);
  expect((await snapshot(request)).session?.prop).toBe("none");

  // With every prop switched off there is nothing to ask.
  await request.post(`/api/sessions/${id}/cancel`);
  await request.patch("/api/admin/booth", { data: { props: [] } });
  await page.getByTestId("attract").click();
  await page.getByTestId(`layout-${layout.id}`).click();
  await expect(page.getByTestId("live")).toBeVisible();
  await expect(page.getByTestId("props")).toHaveCount(0);
  expect((await snapshot(request)).session?.prop).toBe("none");
});

/** A whole one-photo session wearing `prop`, from the attract loop to the QR, as the kiosk walks it. */
async function sessionWith(page: import("@playwright/test").Page, request: APIRequestContext, layoutId: string, prop: string) {
  await expect(page.getByTestId("attract")).toBeVisible();
  await page.getByTestId("attract").click();
  await page.getByTestId(`layout-${layoutId}`).click();
  await page.getByTestId(`prop-${prop}`).click();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("review")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("deliver")).toBeVisible();
  return (await snapshot(request)).session!;
}

async function pixels(request: APIRequestContext, url: string) {
  const { data, info } = await sharp(await (await request.get(url)).body()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
