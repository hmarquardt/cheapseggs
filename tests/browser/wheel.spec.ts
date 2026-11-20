import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function enterLounge(page: import("@playwright/test").Page) {
  await page.goto("/play/");
  await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
  await page.getByRole("button", { name: "Enter the lounge" }).click();
  await expect(page.getByRole("button", { name: /Spin the wheel/ })).toBeEnabled();
}

test("server result is revealed instantly for reduced motion and stays readable", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enterLounge(page);
  await expect(page.getByText("44 reviewed ideas in the catalog")).toBeVisible();

  await page.getByRole("button", { name: /Spin the wheel/ }).click();
  const heading = page.locator("#result-title");
  await expect(heading).toBeVisible({ timeout: 5000 });
  await expect(heading).toBeFocused();
  await expect(page.getByText(/not permission, a dare or an obligation/)).toBeVisible();
  await expect(page.getByText(/ideas fit your house rules right now/)).toBeVisible();

  // The textual alternative matches the drawn wheel and marks the winner.
  const list = page.getByRole("list").filter({ has: page.locator("li[aria-current='true']") });
  await expect(list.locator("li")).toHaveCount(8);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("spin-result.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("the result is a prompt: hide it, undo it, and keep no browsing state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterLounge(page);
  await page.getByRole("button", { name: /Spin the wheel/ }).click();
  const heading = page.locator("#result-title");
  await expect(heading).toBeVisible({ timeout: 5000 });
  const title = (await heading.innerText()).trim();

  await page.getByRole("button", { name: "Not tonight" }).click();
  await expect(heading).toBeHidden();
  await expect(page.getByRole("heading", { name: "Hidden tonight" })).toBeVisible();
  const hidden = page.locator(".hidden-list li").first();
  await expect(hidden).toContainText(title);

  await page.getByRole("button", { name: "Put it back" }).click();
  await expect(page.getByRole("heading", { name: "Hidden tonight" })).toBeHidden();

  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect((await page.context().cookies()).length).toBe(0);

  await page.getByRole("button", { name: "Clear this session" }).click();
  await expect(page.getByText(/Spin to draw tonight/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Spin the wheel/ })).toBeEnabled();
});

test("keyboard users can change limits and spin without a pointer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterLounge(page);
  await page.getByRole("radio", { name: "Medium" }).check();
  const offering = page.getByRole("group", { name: "Ask before offering" });
  await offering.getByRole("checkbox", { name: "Senses" }).check();
  await expect(offering.getByRole("checkbox", { name: "Senses" })).toBeChecked();
  await page.getByRole("button", { name: /Spin the wheel/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#result-title")).toBeVisible({ timeout: 5000 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("an empty menu is reported honestly with no invented result", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterLounge(page);
  for (const name of [
    "Connection",
    "Playful trouble",
    "Atmosphere",
    "Movement",
    "Touch & closeness",
    "Senses",
    "Make-believe",
    "Afterglow",
  ]) {
    const chip = page.locator(".chip-no").filter({ hasText: name }).first();
    await chip.click();
    await expect(chip.locator("input")).toBeChecked();
  }
  await page.getByRole("button", { name: /Spin the wheel/ }).click();
  await expect(page.getByRole("heading", { name: "Those limits leave no ideas." })).toBeVisible();
  await expect(page.getByText(/Nothing was loosened for you/)).toBeVisible();
  await expect(page.locator("#result-title")).toHaveCount(0);
});
