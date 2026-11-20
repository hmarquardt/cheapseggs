import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function enterKitchen(page: import("@playwright/test").Page) {
  await page.goto("/date-night/");
  await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
  await page.getByRole("button", { name: "Open the kitchen" }).click();
  await expect(page.getByRole("heading", { name: "Set the rules" })).toBeVisible();
}

test("the machine composes a whole evening, then rerolls and re-times it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enterKitchen(page);

  await page.getByRole("button", { name: "Compose my evening" }).click();
  const heading = page.locator("#plan-title");
  await expect(heading).toBeVisible({ timeout: 8000 });
  await expect(heading).toBeFocused();
  await expect(page.getByText("min budget")).toBeVisible();

  const steps = page.locator(".plan-step");
  const initialCount = await steps.count();
  expect(initialCount).toBeGreaterThanOrEqual(3);
  await expect(page.locator(".plan-step").first()).toContainText("Preparation");

  // Reroll one main course: the plan keeps its shape and reports the change.
  const main = page.locator(".plan-step.step-main").first();
  await expect(main).toBeVisible();
  const before = (await main.locator("h3").textContent())?.trim();
  await main.getByRole("button", { name: "Reroll this step" }).click();
  await expect(page.getByText(/Step replaced|That step was left|no other eligible/)).toBeVisible({
    timeout: 8000,
  });
  if (await main.isVisible()) {
    const after = (await main.locator("h3").textContent())?.trim();
    expect(typeof after).toBe("string");
    expect(after?.length).toBeGreaterThan(0);
    expect(before?.length).toBeGreaterThan(0);
  }

  // Re-time the kept evening into a longer budget.
  await page.getByLabel("Change the time budget").selectOption("all-evening");
  await expect(page.getByText(/Re-timed|not be re-timed/)).toBeVisible({ timeout: 8000 });
  await expect(page.locator("#plan-title")).toBeVisible();

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("an impossible menu is reported honestly and nothing is invented", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterKitchen(page);
  const hardNo = page.locator(".chip-no");
  const count = await hardNo.count();
  for (let index = 0; index < count; index++) await hardNo.nth(index).click();
  await page.getByRole("button", { name: "Compose my evening" }).click();
  await expect(page.getByRole("heading", { name: "No recipe fits those rules." })).toBeVisible({
    timeout: 8000,
  });
  await expect(page.getByText(/Nothing was loosened for you/)).toBeVisible();
  await expect(page.locator("#plan-title")).toHaveCount(0);
});

test("rules and plans stay on the device, with no cookies or storage", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterKitchen(page);
  await page.getByRole("button", { name: "Compose my evening" }).click();
  await expect(page.locator("#plan-title")).toBeVisible({ timeout: 8000 });
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect((await page.context().cookies()).length).toBe(0);
  await page.getByRole("button", { name: "Change the rules" }).click();
  await expect(page.getByRole("heading", { name: "Set the rules" })).toBeVisible();
});

test("the cookbook opens recipes and hands them to the machine", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/recipes/");
  const cards = page.locator(".recipe-card");
  await expect(cards.first()).toBeVisible({ timeout: 8000 });
  expect(await cards.count()).toBe(12);

  await page.getByRole("button", { name: "Playful", exact: true }).click();
  const playful = await cards.count();
  expect(playful).toBeLessThan(12);
  await page.getByRole("button", { name: "Everything" }).click();
  await expect(cards).toHaveCount(12);

  await cards.first().getByRole("button", { name: "Open the recipe" }).click();
  await expect(page.locator("#recipe-title")).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("heading", { name: "Ingredients" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Method" })).toBeVisible();
  const handoff = page.getByRole("link", { name: "Cook this tonight" });
  await expect(handoff).toBeVisible();
  expect(await handoff.getAttribute("href")).toMatch(/^\/date-night\/\?recipe=/);

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("mobile: both experiences fit without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterKitchen(page);
  let overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.goto("/recipes/");
  await expect(page.locator(".recipe-card").first()).toBeVisible({ timeout: 8000 });
  overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
