import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { DISCOVERY_ENTRIES } from "../../src/content/discovery/catalog";

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
  await expect(
    page.getByText(
      `${DISCOVERY_ENTRIES.filter((entry) => entry.status === "published").length} reviewed ideas on this wheel`,
    ),
  ).toBeVisible();

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
  const title = ((await heading.textContent()) ?? "").trim();

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
  // Longer menus and a taller mobile page make this the slowest keyboard path in CI.
  test.slow();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterLounge(page);
  const medium = page.getByRole("radio", { name: "Medium" });
  await medium.scrollIntoViewIfNeeded();
  await medium.check();
  const senses = page.locator("label.chip", { hasText: "Senses" }).first();
  await senses.scrollIntoViewIfNeeded();
  await senses.click();
  await expect(senses.locator("input")).toBeChecked();
  const spinButton = page.getByRole("button", { name: /Spin the wheel/ });
  await spinButton.scrollIntoViewIfNeeded();
  await spinButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#result-title")).toBeVisible({ timeout: 8000 });
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
    "Playful power",
    "Flirting & teasing",
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

test("the drawn wheel points at the winner and keeps captions inside the rim", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterLounge(page);

  // Before the first spin the machine has to look deliberate, not like an empty circle.
  await expect(page.locator(".wheel-svg path.wheel-wedge")).toHaveCount(8);
  await expect(page.locator(".wheel-hub-label")).toHaveText("SPIN");

  await page.getByRole("button", { name: /Spin the wheel/ }).click();
  await expect(page.locator("#result-title")).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".wheel-hub-label")).toHaveText("CS");

  const geometry = await page.evaluate(() => {
    const disc = document.querySelector(".wheel-disc") as HTMLElement;
    const svg = document.querySelector(".wheel-svg") as SVGSVGElement;
    const matrix = new DOMMatrixReadOnly(getComputedStyle(disc).transform);
    const rotation = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
    const wedges = svg.querySelectorAll("path.wheel-wedge").length;
    const step = 360 / wedges;
    const raw = -rotation / step;
    const underPointer = Math.round(((raw % wedges) + wedges) % wedges) % wedges;
    const winner = [...document.querySelectorAll(".shortlist li")].findIndex((item) =>
      item.classList.contains("is-winner"),
    );
    const radius = (point: { x: number; y: number }) => Math.hypot(point.x - 120, point.y - 120);
    const captions = [...svg.querySelectorAll("text.wheel-caption")].map((node) => {
      const text = node as SVGTextElement;
      return Math.max(
        radius(text.getStartPositionOfChar(0)),
        radius(text.getEndPositionOfChar(text.getNumberOfChars() - 1)),
      );
    });
    return {
      underPointer,
      winner,
      wedges,
      captions: captions.length,
      maxCaptionRadius: Math.round(Math.max(...captions)),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(geometry.wedges).toBe(8);
  expect(geometry.underPointer).toBe(geometry.winner);
  expect(geometry.captions).toBeGreaterThan(1);
  // Captions sit inside the rim (107) and outside the hub (22).
  expect(geometry.maxCaptionRadius).toBeLessThanOrEqual(101);
  expect(geometry.maxCaptionRadius).toBeGreaterThan(60);
  // A rotated wheel and long captions must not push the page sideways.
  expect(geometry.overflow).toBeLessThanOrEqual(0);
});
