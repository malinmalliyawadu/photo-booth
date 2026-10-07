import { expect, test } from "@playwright/test";
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

test("the attendant can sign in, see status and pause the booth", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByTestId("password").fill(process.env.ADMIN_PASSWORD ?? "e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("component-worker")).toHaveAttribute("data-status", "ok");
  await expect(page.getByTestId("component-camera")).toHaveAttribute("data-status", "ok");

  await page.getByTestId("pause").click();
  await expect(page.getByTestId("pause")).toHaveText(/Resume/);
  await page.getByTestId("pause").click();
  await expect(page.getByTestId("pause")).toHaveText(/Pause/);
});
