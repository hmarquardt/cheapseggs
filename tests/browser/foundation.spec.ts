import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { DISCOVERY_ENTRIES } from "../../src/content/discovery/catalog";

test("public shell, adult acknowledgement and accessibility", async ({ page }, testInfo) => {
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
  await page.getByRole("link", { name: "Spin a wheel" }).click();

  const enter = page.getByRole("button", { name: "Enter the lounge" });
  await expect(enter).toBeDisabled();
  await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
  await enter.click();
  await expect(page.locator("#stage-title")).toBeFocused();
  await expect(page.getByRole("heading", { name: "MISFORTUNE" })).toBeVisible();
  await expect(page.getByText(/It is never permission/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("lounge.png"), fullPage: true });

  // Guest state stays in memory: no cookies, local storage or session storage.
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect((await page.context().cookies()).length).toBe(0);
  await page.reload();
  await expect(enter).toBeDisabled();

  await page.goto("/privacy/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your boundaries");
  await expect(page.getByRole("heading", { name: "What a spin stores" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("worker readiness, wheel configuration, private endpoints and headers", async ({
  request,
}) => {
  expect((await request.get("/api/ready")).status()).toBe(200);
  const preview = await request.get("/api/v1/catalog/preview");
  expect(preview.status()).toBe(200);
  expect((await preview.json()).items).toHaveLength(3);

  const wheel = await request.get("/api/v1/wheels/misfortune");
  expect(wheel.status()).toBe(200);
  expect(wheel.headers()["cache-control"]).toBe("no-store");
  const config = await wheel.json();
  expect(config.counts.total).toBe(
    DISCOVERY_ENTRIES.filter((entry) => entry.status === "published").length,
  );
  expect(config.counts.byHeat["3"]).toBe(0);
  expect(config.disclosure.promptNotConsent).toBe(true);

  expect((await request.get("/api/v1/preferences/another-user")).status()).toBe(404);
  expect((await request.post("/api/payments/webhook")).status()).toBe(503);
  const privateShell = await request.get("/play/");
  expect(privateShell.status()).toBe(200);
  expect(privateShell.headers()["cache-control"]).toBe("no-store");
  expect(privateShell.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});
