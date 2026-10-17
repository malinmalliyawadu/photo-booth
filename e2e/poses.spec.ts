import { expect, test } from "@playwright/test";
import { resetBooth, snapshot, waitForWorker } from "./helpers";

/** `POSE_READING_SECONDS` in core: what a countdown with an idea on the screen gains. */
const READING_SECONDS = 2;

/**
 * The pose ideas: a step before posing offers one per photo, the
 * guests who take them start a longer countdown with each idea over the
 * viewfinder, and the plan is the session's from then on.
 */
test.beforeEach(async ({ request }) => {
  await waitForWorker(request);
  await resetBooth(request);
  await request.patch("/api/admin/booth", { data: { poseIdeas: true } });
});

test.afterAll(async ({ request }) => {
  await resetBooth(request);
});

test("the guests take the ideas, and pose through them one photo at a time", async ({ page, request }) => {
  const before = await snapshot(request);
  expect(before.booth.poseIdeas).toBe(true);
  const layout = before.templates.find((t) => t.active && t.shotCount === 4)!;
  await page.goto("/");
  await page.getByTestId("attract").click();
  await page.getByTestId(`layout-${layout.id}`).click();

  // One idea per photo, climbing from a classic to a wild one; "Other ideas" draws again.
  const poses = page.getByTestId("poses");
  await expect(poses).toBeVisible();
  // The fake camera and no props: the picker, the ideas, the posing, the review.
  await expect(poses.getByText("Step two of four")).toBeVisible();
  await expect(poses.getByTestId("headcount")).toHaveCount(0);
  const planned = async () => {
    const rows = page.getByTestId("pose-plan").locator("li");
    return rows.evaluateAll((els) => els.map((el) => ({ id: el.getAttribute("data-pose")!, title: el.querySelector(".display-italic")!.textContent! })));
  };
  const first = await planned();
  expect(first).toHaveLength(4);
  expect(new Set(first.map((p) => p.id)).size).toBe(4);
  let drawn = first;
  const ids = (plan: typeof first) => plan.map((p) => p.id);
  for (let tries = 0; tries < 8 && ids(drawn).join() === ids(first).join(); tries++) {
    await page.getByTestId("shuffle").click();
    drawn = await planned();
  }
  expect(ids(drawn)).not.toEqual(ids(first));
  expect(drawn).toHaveLength(4);

  // Straight into the countdown (no props with the fake camera), with time to read.
  await expect(page.getByTestId("poses-take")).toHaveText(/Start with ideas/);
  await page.getByTestId("poses-take").click();
  const live = page.getByTestId("live");
  await expect(live).toBeVisible();
  const started = (await snapshot(request)).session!;
  expect(started.poses).toEqual(ids(drawn));
  expect(started.countdownSeconds).toBe(1 + READING_SECONDS);

  // Each photo's idea is on the screen while it counts down, in order.
  for (let shot = 1; shot <= 4; shot++) {
    await expect(page.getByTestId("shot-label")).toHaveText(`Photo ${shot} of 4`, { timeout: 15_000 });
    await expect(page.getByTestId("pose")).toHaveAttribute("data-pose", drawn[shot - 1]!.id);
    await expect(page.getByTestId("pose")).toContainText(drawn[shot - 1]!.title);
    await expect(page.getByTestId("hold-still")).toBeVisible({ timeout: 15_000 });
  }
  await expect(page.getByTestId("review")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("review").getByText("Step four of four")).toBeVisible();
  // A retake poses through the same ideas.
  await page.getByTestId("retake").click();
  await expect(page.getByTestId("pose")).toHaveAttribute("data-pose", drawn[0]!.id);
  expect((await snapshot(request)).session?.poses).toEqual(ids(drawn));
});

test("the guests who know what to do start without, at the booth's own countdown", async ({ page, request }) => {
  const layout = (await snapshot(request)).templates.find((t) => t.active && t.shotCount === 1)!;
  await page.goto("/");
  await page.getByTestId("attract").click();
  await page.getByTestId(`layout-${layout.id}`).click();
  await expect(page.getByTestId("poses-skip")).toHaveText(/Start without/);
  await page.getByTestId("poses-skip").click();
  await expect(page.getByTestId("live")).toBeVisible();
  await expect(page.getByTestId("pose")).toHaveCount(0);
  const started = (await snapshot(request)).session!;
  expect(started.poses).toBeNull();
  expect(started.countdownSeconds).toBe(1);
});

test("a plan is refused when the booth offers none, or does not fit the layout", async ({ page, request }) => {
  const layouts = (await snapshot(request)).templates.filter((t) => t.active);
  const two = layouts.find((t) => t.shotCount === 4)!;
  const unknown = await request.post("/api/sessions", { data: { templateId: two.id, poses: ["smile", "handstand", "jump", "roar"] } });
  expect(unknown.status()).toBe(400);
  const short = await request.post("/api/sessions", { data: { templateId: two.id, poses: ["smile"] } });
  expect(short.status()).toBe(400);
  expect(((await short.json()) as { error: string }).error).toMatch(/takes 4 photos/);

  // Switched off: the step is gone from the kiosk and the plan from the API.
  await request.patch("/api/admin/booth", { data: { poseIdeas: false } });
  const refused = await request.post("/api/sessions", { data: { templateId: two.id, poses: ["smile", "peace", "wink", "jump"] } });
  expect(refused.status()).toBe(400);
  await page.goto("/");
  await page.getByTestId("attract").click();
  await page.getByTestId(`layout-${two.id}`).click();
  await expect(page.getByTestId("live")).toBeVisible();
  await expect(page.getByTestId("poses")).toHaveCount(0);
});
