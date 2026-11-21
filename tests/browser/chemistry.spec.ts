import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("a visitor answers, reviews and sees a labelled demonstration report", async ({ page }) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/chemistry/");
  await expect(page.getByRole("heading", { name: /A little less guessing/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole("button", { name: "Start the Quick Check" }).click();
  await expect(page.locator(".chemistry-progress-label")).toContainText("Question 1 of 25");
  await expect(page.locator(".chemistry-prompt")).toBeFocused();

  // Answer one question explicitly with an explicit acceptance rule.
  await page.locator(".chemistry-option input").first().check();
  await page.getByRole("radio", { name: "Only the ones I tick" }).check();
  await expect(page.getByText(/No answers ticked yet/)).toBeVisible();
  await page.locator(".chemistry-accept-list input").first().check();
  await expect(page.getByText(/No answers ticked yet/)).toBeHidden();
  await page.getByRole("radio", { name: "Any of these answers" }).check();
  await page.getByRole("button", { name: "Next question" }).click();

  // Skipping is allowed and never auto-advances into a result.
  await expect(page.locator(".chemistry-progress-label")).toContainText("Question 2 of 25");
  await page.getByRole("button", { name: "Skip this question" }).click();
  await expect(page.locator(".chemistry-progress-label")).toContainText("Question 3 of 25");

  await page.getByRole("button", { name: "Finish early and review" }).click();
  await expect(page.getByRole("heading", { name: "Review before you share." })).toBeVisible();
  await expect(page.getByText("Nothing has been sent or saved.")).toBeVisible();
  await page.getByRole("button", { name: "Show the demonstration report" }).click();

  // Honest insufficient-coverage state rather than a fabricated result.
  await expect(
    page.getByRole("heading", { name: "Not enough shared answers for a report." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Use demonstration answers" }).click();
  await expect(page.getByRole("heading", { name: "Review before you share." })).toBeVisible();
  await page.getByRole("button", { name: "Show the demonstration report" }).click();

  await expect(page.getByRole("heading", { name: "The Chemistry Report." })).toBeVisible();
  await expect(page.locator(".chemistry-band")).toHaveCount(8);
  await expect(page.getByText(/both people must opt in/)).toBeVisible();
  await expect(
    page.getByText(
      "This describes the answers you chose to include. It cannot predict chemistry, honesty, safety or relationship outcomes.",
    ),
  ).toBeVisible();
  await expect(page.getByText(/No overall match percentage is shown/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("the sample report is coarse, private by default and free of raw answers", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/chemistry/");
  await page.getByRole("button", { name: "See a sample report" }).click();

  await expect(page.getByRole("heading", { name: "The Chemistry Report." })).toBeVisible();
  const report = page.locator(".chemistry-report");
  await expect(report).toContainText("Demonstration pairing");
  // Sexual compatibility is not shared by default.
  const intimacy = page.locator(".chemistry-band", { hasText: "Intimacy expectations" });
  await expect(intimacy).toContainText("Unassessed");
  await expect(intimacy).toContainText("both people must opt in");
  // No overall percentage and no individual weights or directional values.
  await expect(report).not.toContainText(/\b\d{1,3}%\b/);
  await expect(report).not.toContainText("importance");
  await expect(page.getByRole("button", { name: "Start over" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("invitation fragments leave the address bar and revocation actions send the required headers", async ({
  page,
}) => {
  const id = "00000000-0000-4000-8000-000000000001";
  const view = {
    id,
    depth: 25,
    manifestId: "chemistry-25-v1",
    status: "collecting",
    createdAt: 1,
    acceptedAt: 2,
    assessmentExpiresAt: 9999999999,
    reportExpiresAt: null,
    role: "creator",
    own: { submitted: true, submissionRevision: 1, draftRevision: 1, approved: false },
    invitation: null,
    reportAvailable: false,
  };
  const requests: { method: string; path: string; action: string | undefined }[] = [];
  await page.route("**/api/account", (route) => route.fulfill({ json: { account: {} } }));
  await page.route("**/api/v1/chemistry-check/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      requests.push({
        method: request.method(),
        path,
        action: request.headers()["x-cheapseggs-action"],
      });
      expect(request.headers()["x-cheapseggs-action"]).toBe("chemistry");
      expect(request.headers()["content-type"]).toBe("application/json");
    }
    if (path.endsWith("/status")) return route.fulfill({ json: { available: true } });
    if (path.endsWith("/draft"))
      return route.fulfill({ status: 404, json: { error: "not_found" } });
    if (path.endsWith("/assessments") && request.method() === "GET")
      return route.fulfill({ json: { assessments: [view] } });
    if (path.endsWith(id) && request.method() === "GET")
      return route.fulfill({ json: { assessment: view } });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/chemistry/#invite=synthetic-browser-test-only-token");
  await expect(page).toHaveURL(/\/chemistry\/$/);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Private assessment", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Withdraw assessment", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: "Delete assessment data", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open", exact: true })).toBeVisible();
  expect(requests).toEqual([
    {
      method: "POST",
      path: `/api/v1/chemistry-check/assessments/${id}/withdraw`,
      action: "chemistry",
    },
    { method: "DELETE", path: `/api/v1/chemistry-check/assessments/${id}`, action: "chemistry" },
  ]);
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).toEqual({ local: 0, session: 0 });
});
