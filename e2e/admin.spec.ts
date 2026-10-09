import { expect, test, type Page } from "@playwright/test";
import { resetBooth, waitForWorker } from "./helpers";

test.beforeEach(async ({ request }) => {
  await waitForWorker(request);
  await resetBooth(request);
});

test("admin is locked without the password", async ({ browser }) => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  const res = await page.request.patch("/api/admin/booth", { data: { paused: true } });
  expect(res.status()).toBe(401);
  await context.close();
});

async function signIn(page: Page) {
  await page.goto("/admin/login");
  await page.getByTestId("password").fill(process.env.ADMIN_PASSWORD ?? "e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("the attendant can sign in, see status and pause the booth", async ({ page }) => {
  await signIn(page);
  await expect(page.getByTestId("component-worker")).toHaveAttribute("data-status", "ok");
  await expect(page.getByTestId("component-camera")).toHaveAttribute("data-status", "ok");

  await page.getByTestId("pause").click();
  await expect(page.getByTestId("pause")).toHaveText(/Resume/);
  await page.getByTestId("pause").click();
  await expect(page.getByTestId("pause")).toHaveText(/Pause/);
});

test("the attendant refills the paper tray and changes the ink cassette apart", async ({ page, request }) => {
  await request.patch("/api/admin/booth", { data: { paperLeft: 0, inkLeft: 4 } });
  await signIn(page);
  const paper = page.getByTestId("paper");
  const ink = page.getByTestId("ink");
  await expect(paper).toHaveText("0/18");
  await expect(ink).toHaveText("4/36");
  await expect(page.getByText("Empty", { exact: true })).toBeVisible();
  await expect(page.getByText("Low", { exact: true })).toBeVisible();

  await page.getByTestId("refill-paper").click();
  await expect(paper).toHaveText("18/18");
  await expect(ink).toHaveText("4/36");
  await page.getByTestId("new-ink").click();
  await expect(ink).toHaveText("36/36");
  await expect(page.getByText("Low", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Empty", { exact: true })).toHaveCount(0);
});
