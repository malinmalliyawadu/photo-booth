import { expect, test, type Page } from "@playwright/test";
import { resetBooth, snapshot, waitForWorker } from "./helpers";

test.beforeEach(async ({ request }) => {
  await waitForWorker(request);
  await resetBooth(request);
});

test.afterAll(async ({ request }) => {
  await resetBooth(request);
});

/** One guest through the one-photo layout, to the QR and back to the attract loop; returns the session's ID. */
async function takeOnePhoto(page: Page, request: Parameters<typeof snapshot>[0]): Promise<string> {
  const layout = (await snapshot(request)).templates.find((t) => t.active && t.shotCount === 1)!;
  await request.patch("/api/admin/booth", { data: { lockedTemplateId: layout.id } });
  await page.goto("/");
  await page.getByTestId("attract").click();
  await expect(page.getByTestId("review")).toBeVisible();
  await page.getByTestId("accept").click();
  await expect(page.getByTestId("print-status")).toHaveText(/in the tray/);
  const id = (await snapshot(request)).session!.id;
  await page.getByTestId("done").click();
  await expect(page.getByTestId("attract")).toBeVisible();
  return id;
}

test("a guest finds an earlier print and has a copy, once", async ({ page, request }) => {
  const id = await takeOnePhoto(page, request);
  expect((await snapshot(request)).booth).toMatchObject({ paperLeft: 17, inkLeft: 35 });

  await page.getByTestId("copies-open").click();
  await expect(page.getByTestId("copies")).toBeVisible();
  await page.getByTestId(`print-${id}`).click();
  const copy = page.getByTestId("copy");
  await expect(copy).toBeVisible();
  await expect(copy.getByTestId("composed")).toHaveAttribute("src", (await snapshot(request)).recent.find((s) => s.id === id)!.webUrl!);

  await page.getByTestId("print-copy").click();
  await expect(page.getByTestId("copy-sent")).toBeVisible();
  // The copy is a print like the attendant's Reprint: it comes down the
  // same lane, takes a card and a print's ink, and leaves the session's
  // own print status alone.
  await expect.poll(async () => (await snapshot(request)).recent.find((s) => s.id === id)?.printCount).toBe(2);
  const after = await snapshot(request);
  expect(after.recent.find((s) => s.id === id)).toMatchObject({ guestCopies: 1, print: "printed", phase: "done" });
  expect(after.booth).toMatchObject({ paperLeft: 16, inkLeft: 34 });

  await page.getByTestId("copy-done").click();
  await expect(page.getByTestId("attract")).toBeVisible();

  // One copy per print: the button is not offered again, and the booth refuses it anyway.
  await page.getByTestId("copies-open").click();
  await page.getByTestId(`print-${id}`).click();
  await expect(page.getByTestId("copy-refusal")).toHaveText("This print has had its copy");
  await expect(page.getByTestId("print-copy")).toBeDisabled();
  const again = await request.post(`/api/sessions/${id}/copy`);
  expect(again.status()).toBe(409);
  expect(((await again.json()) as { error: string }).error).toBe("This print has had its copy");
  expect((await snapshot(request)).recent.find((s) => s.id === id)?.guestCopies).toBe(1);
});

test("copies keep the last cards for new guests, and the attendant can switch them off", async ({ page, request }) => {
  const id = await takeOnePhoto(page, request);
  await request.patch("/api/admin/booth", { data: { guestCopyLimit: 2, paperLeft: 2 } });
  await page.getByTestId("copies-open").click();
  await page.getByTestId(`print-${id}`).click();
  await expect(page.getByTestId("copy-refusal")).toHaveText(/kept for new photos/);
  await expect(page.getByTestId("print-copy")).toBeDisabled();
  expect((await request.post(`/api/sessions/${id}/copy`)).status()).toBe(409);

  // Refilled: the button comes back without leaving the screen, and says how many are left.
  await request.patch("/api/admin/booth", { data: { paperLeft: 18 } });
  await expect(page.getByTestId("print-copy")).toBeEnabled();
  await expect(page.getByTestId("copies-left")).toHaveText("2 of 2 copies left for this print");

  // Switched off while a guest is browsing: back to the attract loop, with no way in.
  await request.patch("/api/admin/booth", { data: { guestCopyLimit: 0 } });
  await expect(page.getByTestId("attract")).toBeVisible();
  await expect(page.getByTestId("copies-open")).toHaveCount(0);
  expect((await request.post(`/api/sessions/${id}/copy`)).status()).toBe(409);
});

test("a deleted session is not offered for a copy", async ({ page, request }) => {
  const id = await takeOnePhoto(page, request);
  const prints = async () => ((await (await request.get("/api/kiosk/prints")).json()) as { prints: { id: string }[] }).prints.map((p) => p.id);
  expect(await prints()).toContain(id);
  expect((await request.delete(`/api/admin/sessions/${id}`)).ok()).toBeTruthy();
  expect(await prints()).not.toContain(id);
  expect((await request.post(`/api/sessions/${id}/copy`)).status()).toBe(409);
});
