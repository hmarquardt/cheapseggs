import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("unavailable email collects nothing and guest wheel stays available", async ({
  page,
  request,
}) => {
  const response = await page.goto("/account/");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toBe("no-store");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.getByRole("heading", { name: "Email sign-in is not open yet." })).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveCount(0);
  expect((await page.context().cookies()).length).toBe(0);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const status = await request.get("/api/account/status");
  expect(await status.json()).toEqual({
    emailSignInAvailable: false,
    ageVerificationAvailable: false,
    restrictedContentAvailable: false,
  });
  await page.getByRole("link", { name: "Guest wheel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Adults, on their own terms." })).toBeVisible();
});

test("account form requires adulthood, deliberate code submission and deletion confirmation", async ({
  page,
}) => {
  // Browser UX contract; real auth, revocation and deletion run separately against workerd/D1.
  let signedIn = false;
  const actions: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const post = route.request().method() === "POST";
    if (post) actions.push(path);
    if (path === "/api/account/status")
      return route.fulfill({ json: { emailSignInAvailable: true } });
    if (path === "/api/account")
      return route.fulfill(
        signedIn
          ? {
              json: {
                email: "browser@example.com",
                state: "registered_self_declared_adult",
                adultStatus: { selfDeclared: true, independentlyVerified: false },
                categoryApprovals: [],
                freshAuthentication: true,
              },
            }
          : { status: 401, json: { error: "sign_in_required" } },
      );
    if (path === "/api/account/sessions") return route.fulfill({ json: { sessions: [] } });
    if (path === "/api/auth/sign-in/email-otp") signedIn = true;
    if (path === "/api/account/delete") signedIn = false;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/account/");
  await page.getByLabel("Email address").fill("browser@example.com");
  await expect(page.getByRole("button", { name: "Send account code" })).toBeDisabled();
  await page.getByLabel("I am 18 or older.", { exact: false }).check();
  await page.getByRole("button", { name: "Send account code" }).click();
  await page.getByLabel("Eight-digit code").fill("12345678");
  expect(actions).toEqual(["/api/auth/email-otp/send-verification-otp"]);
  await page.getByRole("button", { name: "Confirm code" }).click();
  await expect(page.getByText("Signed in as browser@example.com")).toBeVisible();
  await expect(
    page.getByText("Verified-adult and restricted content are closed.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete my account" })).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText("Your account has been deleted.")).toBeVisible();
  await expect(page.getByText("Signed in as browser@example.com")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});
