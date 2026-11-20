import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { PUBLIC_PATHS, SITE_ORIGIN } from "../src/config/site.ts";
import { releaseResponse } from "./release-response.ts";

const expected = process.env.EXPECTED_REVISION ?? process.argv[2];
const base = process.env.SMOKE_ORIGIN ?? SITE_ORIGIN;
const evidence: { check: string; result: unknown }[] = [];
const releaseDeadline = Date.now() + 90000;
async function get(path: string, options?: RequestInit): Promise<Response> {
  return releaseResponse(`${base}${path}`, expected, {
    ...(options ? { init: options } : {}),
    deadline: releaseDeadline,
  });
}
const versionResponse = await get("/api/version");
assert.equal(versionResponse.status, 200);
const version = (await versionResponse.json()) as {
  revision: string;
  workerVersion: string;
  environment: string;
};
if (expected) assert.equal(version.revision, expected);
assert.match(version.revision, /^[a-f0-9]{40}$/);
assert.equal(version.environment, "production");
assert.ok(version.workerVersion);
evidence.push({ check: "release", result: version });
for (const path of ["/api/health", "/api/ready", "/api/v1/catalog/preview"]) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-cheapseggs-revision"), version.revision);
  const body = await response.json();
  if (path.endsWith("preview")) assert.equal((body as { items: unknown[] }).items.length, 3);
  evidence.push({ check: path, result: response.status });
}
const agents = {
  browser: "Mozilla/5.0 (compatible; CheapSeggsReleaseCheck/1.0)",
  facebook: "facebookexternalhit/1.1",
  twitter: "Twitterbot/1.0",
  linkedin: "LinkedInBot/1.0",
};
for (const path of PUBLIC_PATHS) {
  let original = "";
  for (const [name, userAgent] of Object.entries(agents)) {
    const response = await get(path, { headers: { "User-Agent": userAgent } });
    assert.equal(response.status, 200, `${path} ${name}`);
    const html = await response.text();
    assert.ok(html.includes(`rel="canonical" href="${SITE_ORIGIN}${path}"`), path);
    for (const metadata of [
      'property="og:title"',
      'property="og:description"',
      'property="og:type"',
      'property="og:url"',
      'property="og:image"',
      'name="twitter:card"',
      'name="twitter:image"',
    ])
      assert.ok(html.includes(metadata), `${path} ${metadata}`);
    assert.ok(!html.includes('name="robots" content="noindex'), path);
    assert.ok(!response.headers.get("x-robots-tag")?.includes("noindex"), path);
    assert.ok(response.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"));
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.ok(response.headers.get("strict-transport-security"));
    assert.equal(response.headers.get("x-cheapseggs-revision"), version.revision);
    if (original) assert.equal(html, original, `${path}: crawler HTML must match browser HTML`);
    original = html;
  }
  const imagePath = /property="og:image" content="https:\/\/cheapseggs.com([^"]+)"/.exec(
    original,
  )?.[1];
  assert.ok(imagePath);
  const image = await get(imagePath);
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type") ?? "", /image\/png/);
  const bytes = new DataView(await image.arrayBuffer());
  assert.equal(bytes.getUint32(16), 1200);
  assert.equal(bytes.getUint32(20), 630);
  evidence.push({ check: `${path} metadata/crawlers/image`, result: "pass" });
}
const home = await (await get("/")).text();
for (const path of [...home.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
  (match) => match[1],
)) {
  if (path) assert.equal((await get(path)).status, 200, path);
}
for (const path of [
  "/play/",
  "/invite/private-token",
  "/assessments/private-id",
  "/api/v1/couples/private/preferences",
  "/missing-page",
]) {
  const response = await get(path);
  assert.equal(response.status, path === "/play/" ? 200 : 404, path);
  assert.ok(response.headers.get("x-robots-tag")?.includes("noindex"), path);
  if (path !== "/missing-page")
    assert.equal(response.headers.get("cache-control"), "no-store", path);
}
assert.equal((await get("/api/auth/sign-in", { method: "POST" })).status, 503);
assert.equal((await get("/api/payments/webhook", { method: "POST" })).status, 503);
const sitemap = await (await get("/sitemap.xml")).text();
assert.equal((sitemap.match(/<loc>/g) ?? []).length, PUBLIC_PATHS.length);
assert.ok(!(sitemap.includes("/play/") || sitemap.includes("/api/")));
assert.ok(
  (await (await get("/robots.txt")).text()).includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`),
);
if (base === SITE_ORIGIN) {
  const redirect = await fetch("https://www.cheapseggs.com/chemistry/", {
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("location"), `${SITE_ORIGIN}/chemistry/`);
  evidence.push({ check: "www-to-apex", result: 308 });
  const insecure = await fetch("http://cheapseggs.com/", {
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(insecure.status, 308);
  assert.equal(insecure.headers.get("location"), `${SITE_ORIGIN}/`);
  evidence.push({ check: "http-to-https", result: 308 });
}
mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/production-smoke.json",
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      origin: base,
      revision: version.revision,
      workerVersion: version.workerVersion,
      evidence,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    status: "passed",
    revision: version.revision,
    workerVersion: version.workerVersion,
    publicPages: PUBLIC_PATHS.length,
    crawlerAgents: Object.keys(agents),
    evidence: "artifacts/production-smoke.json",
  }),
);
