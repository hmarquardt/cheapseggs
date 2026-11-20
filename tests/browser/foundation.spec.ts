import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("public shell, adult acknowledgement, modes, clearing and accessibility", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Priceless");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("landing.png"), fullPage: true });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.getByRole("link", { name: "Step inside" }).click();
  const enter = page.getByRole("button", { name: "Enter the lounge preview" });
  await expect(enter).toBeDisabled();
  await page.getByRole("checkbox").check();
  await enter.click();
  await expect(page.locator("#modes-title")).toBeFocused();
  await page.getByRole("button", { name: "Mutual Mischief", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mutual Mischief", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByText("Two accounts and sharing approval required.", { exact: false }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("lounge.png"), fullPage: true });
  await page.getByRole("button", { name: "Clear this preview" }).click();
  await expect(enter).toBeDisabled();
  await expect(page.locator("#entry-title")).toBeFocused();
  await page.getByRole("checkbox").check();
  await enter.click();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.reload();
  await expect(enter).toBeDisabled();
  await page.goto("/privacy/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your boundaries");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("worker readiness, sample-only catalog, private endpoints and static headers", async ({
  request,
}) => {
  expect((await request.get("/api/ready")).status()).toBe(200);
  const response = await request.get("/api/v1/catalog/preview");
  expect(response.status()).toBe(200);
  expect((await response.json()).items).toHaveLength(3);
  expect((await request.get("/api/v1/preferences/another-user")).status()).toBe(404);
  expect((await request.post("/api/payments/webhook")).status()).toBe(503);
  const privateShell = await request.get("/play/");
  expect(privateShell.status()).toBe(200);
  expect(privateShell.headers()["cache-control"]).toBe("no-store");
  expect(privateShell.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});
