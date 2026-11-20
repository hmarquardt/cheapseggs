import { expect, test } from "@playwright/test";
import { PUBLIC_PATHS, SITE_ORIGIN } from "../../src/config/site";

test("all indexable pages deliver complete metadata identically to social crawlers", async ({
  request,
}) => {
  for (const path of PUBLIC_PATHS) {
    let original = "";
    for (const userAgent of [
      "Mozilla/5.0",
      "facebookexternalhit/1.1",
      "Twitterbot/1.0",
      "LinkedInBot/1.0",
    ]) {
      const response = await request.get(path, { headers: { "User-Agent": userAgent } });
      expect(response.status(), `${path} ${userAgent}`).toBe(200);
      expect(response.headers()["x-cheapseggs-revision"]).toBe("local");
      const html = await response.text();
      const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? "";
      expect(head).toContain(`rel="canonical" href="${SITE_ORIGIN}${path}"`);
      expect(head).toContain('name="robots" content="index, follow"');
      for (const key of [
        "title",
        "description",
        "type",
        "url",
        "image",
        "image:width",
        "image:height",
        "image:alt",
      ])
        expect(head).toContain(`property="og:${key}"`);
      for (const key of ["card", "title", "description", "image", "image:alt"])
        expect(head).toContain(`name="twitter:${key}"`);
      expect(response.headers()["x-robots-tag"] ?? "").not.toContain("noindex");
      expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
      if (original) expect(html).toBe(original);
      original = html;
    }
    const image = /property="og:image" content="https:\/\/cheapseggs.com([^"]+)"/.exec(
      original,
    )?.[1];
    expect(image).toBeTruthy();
    const response = await request.get(image as string);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    const png = await response.body();
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  }
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect((sitemap.match(/<loc>/g) ?? []).length).toBe(PUBLIC_PATHS.length);
  expect(sitemap).not.toContain("/play/");
  const privatePage = await request.get("/play/");
  expect(privatePage.headers()["x-robots-tag"]).toContain("noindex");
});

test("analytics is opt-in, strips all URL input, counts once and obeys DNT", async ({
  page,
  context,
  request,
}) => {
  const collected: Record<string, unknown>[] = [];
  await context.route("https://cheapseggs.com/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await request.fetch(`${url.pathname}${url.search}`);
    await route.fulfill({ response });
  });
  await context.route("https://analytics.aismallbizguru.com/collect", async (route) => {
    collected.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  await page.goto("https://cheapseggs.com/?utm_source=private&answer=private#private");
  await expect(page.locator("[data-analytics-status]")).toContainText("off");
  expect(collected).toHaveLength(0);
  await page.getByRole("button", { name: "Allow analytics", exact: true }).click();
  await expect.poll(() => collected.length).toBe(1);
  expect(Object.keys(collected[0] ?? {}).sort()).toEqual([
    "event_uid",
    "kind",
    "name",
    "path",
    "site",
  ]);
  expect(collected[0]?.path).toBe("/");
  expect(JSON.stringify(collected)).not.toContain("private");
  await page.getByRole("button", { name: "Turn analytics off" }).click();
  await page.getByRole("button", { name: "Allow analytics", exact: true }).click();
  expect(collected).toHaveLength(1);
  await page.goto("https://cheapseggs.com/play/");
  expect(collected).toHaveLength(1);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "doNotTrack", { get: () => "1" });
  });
  await page.goto("https://cheapseggs.com/");
  await expect(page.getByRole("button", { name: "Allow analytics", exact: true })).toBeDisabled();
  expect(collected).toHaveLength(1);
});
