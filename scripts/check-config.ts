import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import {
  ANALYTICS_SITE_ID,
  PUBLIC_PATHS,
  SITE_JSON_LD,
  SITE_JSON_LD_HASH,
} from "../src/config/site.ts";
import { PUBLIC_PAGES } from "../src/content/public-pages.ts";

const local = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
const production = JSON.parse(readFileSync("wrangler.production.jsonc", "utf8"));
assert.equal(local.vars.APP_ENV, "local");
assert.equal(local.d1_databases[0].database_id, "00000000-0000-0000-0000-000000000000");
assert.equal(production.name, "cheapseggs");
assert.equal(production.account_id, "b1aa310aa0a1638d72b8b086a21e557c");
assert.equal(production.d1_databases[0].database_id, "ef9ff0b0-97d5-428b-81df-cd02fe342bb8");
assert.equal(production.vars.APP_ENV, "production");
assert.equal(production.assets.run_worker_first, true);
assert.equal(production.workers_dev, false);
assert.equal(production.preview_urls, false);
assert.equal(production.observability.enabled, false);
assert.equal(production.version_metadata.binding, "WORKER_VERSION");
assert.deepEqual(production.routes, [
  { pattern: "cheapseggs.com", custom_domain: true },
  { pattern: "www.cheapseggs.com", custom_domain: true },
]);
assert.deepEqual(Object.keys(production.vars).sort(), ["APP_ENV", "DEPLOY_REVISION"]);
assert.match(ANALYTICS_SITE_ID, /^as_[A-Za-z0-9]{22}$/);
assert.equal(
  SITE_JSON_LD_HASH,
  `'sha256-${createHash("sha256").update(SITE_JSON_LD).digest("base64")}'`,
);
assert.deepEqual(
  PUBLIC_PAGES.map((page) => page.path),
  [...PUBLIC_PATHS],
);
for (const name of readdirSync("public/assets/social").filter((name) => name.endsWith(".png"))) {
  const bytes = readFileSync(`public/assets/social/${name}`);
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
}
assert.equal(readdirSync("public/assets/social").filter((name) => name.endsWith(".png")).length, 6);

// Abuse protection is configuration, so a silent removal must fail validation.
interface RateLimitBinding {
  name: string;
  namespace_id: string;
  simple: { limit: number; period: number };
}
const bindings = (config: { ratelimits?: RateLimitBinding[] }): RateLimitBinding[] => {
  assert.ok(Array.isArray(config.ratelimits) && config.ratelimits.length > 0, "ratelimits");
  return config.ratelimits;
};
const productionLimits = bindings(production);
const localLimits = bindings(local);
const NAMES = ["SPIN_RATE_LIMITER", "WHEEL_RATE_LIMITER"];
assert.deepEqual(productionLimits.map((entry) => entry.name).sort(), NAMES.slice().sort());
assert.deepEqual(localLimits.map((entry) => entry.name).sort(), NAMES.slice().sort());
for (const entry of [...productionLimits, ...localLimits]) {
  assert.match(entry.namespace_id, /^[1-9][0-9]{0,9}$/);
  // Cloudflare only accepts a 10s or 60s window.
  assert.equal(entry.simple.period, 60);
  assert.ok(entry.simple.limit > 0 && entry.simple.limit <= 600, `${entry.name}: sane limit`);
}
const productionSpin = productionLimits.find((entry) => entry.name === "SPIN_RATE_LIMITER");
assert.ok(productionSpin);
// Low enough to slow bulk automation, high enough for a shared household address.
assert.ok(productionSpin.simple.limit >= 20 && productionSpin.simple.limit <= 60, "spin limit");
assert.equal(
  new Set([...productionLimits, ...localLimits].map((entry) => entry.namespace_id)).size,
  4,
  "each binding needs its own namespace per environment",
);
console.log(
  "Production/local separation, target bindings, routes, privacy defaults, CSP and social images validated.",
);
