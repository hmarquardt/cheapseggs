import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import {
  ANALYTICS_SITE_ID,
  PUBLIC_PATHS,
  SITE_JSON_LD,
  SITE_JSON_LD_HASH,
} from "../src/config/site.ts";
import {
  CHEMISTRY_BANK_VERSION,
  CHEMISTRY_QUESTIONS,
  DEPTHS,
  DIMENSIONS,
  MANIFESTS,
} from "../src/content/chemistry/questions.ts";
import { PUBLIC_PAGES } from "../src/content/public-pages.ts";

const local = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
const production = JSON.parse(readFileSync("wrangler.production.jsonc", "utf8"));
/** Local development needs a usable key so the required-key path is the only path. */
const LOCAL_DIGEST_KEY = "local-development-only-digest-key";
assert.equal(local.vars.APP_ENV, "local");
assert.equal(local.d1_databases[0].database_id, "00000000-0000-0000-0000-000000000000");
assert.equal(production.name, "cheapseggs");
assert.equal(production.account_id, "b1aa310aa0a1638d72b8b086a21e557c");
assert.equal(production.d1_databases[0].database_id, "ef9ff0b0-97d5-428b-81df-cd02fe342bb8");
assert.equal(production.vars.APP_ENV, "production");
assert.equal(local.vars.SPIN_DIGEST_KEY, LOCAL_DIGEST_KEY);
assert.ok(LOCAL_DIGEST_KEY.length >= 32 && /^[A-Za-z0-9_-]+$/.test(LOCAL_DIGEST_KEY));
// Production supplies the HMAC key as a Worker secret, never as a plaintext var.
assert.equal(production.vars.SPIN_DIGEST_KEY, undefined);
assert.equal(production.assets.run_worker_first, true);
assert.equal(production.workers_dev, false);
assert.equal(production.preview_urls, false);
assert.equal(production.observability.enabled, false);
assert.deepEqual(production.triggers, { crons: ["17 * * * *"] });
assert.equal(production.version_metadata.binding, "WORKER_VERSION");
assert.deepEqual(production.routes, [
  { pattern: "cheapseggs.com", custom_domain: true },
  { pattern: "www.cheapseggs.com", custom_domain: true },
]);
assert.deepEqual(Object.keys(production.vars).sort(), [
  "APP_ENV",
  "AUTH_EMAIL_ENABLED",
  "AUTH_EMAIL_FROM",
  "DEPLOY_REVISION",
]);
// Private Chemistry Check must ship closed: no gate, review or encryption key in config vars.
assert.equal(production.vars.CHEMISTRY_PRIVATE_ENABLED, undefined);
assert.equal(production.vars.CHEMISTRY_PRIVATE_REVIEW_APPROVED, undefined);
assert.equal(production.vars.CHEMISTRY_ENVELOPE_KEY, undefined);
assert.equal(production.vars.CHEMISTRY_ENVELOPE_KEY_VERSION, undefined);
assert.equal(production.vars.CHEMISTRY_ENVELOPE_PREVIOUS_KEYS, undefined);
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

// ------------------------------------------------------ Chemistry Check bank gates
// Editorial invariants: a silent question loss or a broken depth nesting is a release failure.
assert.match(CHEMISTRY_BANK_VERSION, /^chemistry-\d{4}-\d{2}-\d{2}\.v\d+$/);
assert.equal(CHEMISTRY_QUESTIONS.length, 100);
assert.equal(new Set(CHEMISTRY_QUESTIONS.map((question) => question.id)).size, 100);
assert.equal(DIMENSIONS.length, 8);
assert.deepEqual(
  DEPTHS.map((entry) => entry.depth),
  [25, 50, 100],
);
const manifestIds = (depth: 25 | 50 | 100) => new Set(MANIFESTS[depth].questions.map((q) => q.id));
assert.equal(manifestIds(25).size, 25);
assert.equal(manifestIds(50).size, 50);
assert.equal(manifestIds(100).size, 100);
for (const id of manifestIds(25))
  assert.ok(manifestIds(50).has(id), `25 depth missing from 50: ${id}`);
for (const id of manifestIds(50))
  assert.ok(manifestIds(100).has(id), `50 depth missing from 100: ${id}`);
for (const question of CHEMISTRY_QUESTIONS) {
  assert.ok(question.choices.length >= 2, `${question.id}: at least two choices`);
  assert.ok(question.choices.length <= 5, `${question.id}: bounded choices`);
  assert.equal(
    new Set(question.choices.map((choice) => choice.id)).size,
    question.choices.length,
    `${question.id}: duplicate choice ids`,
  );
  assert.ok(question.prompt.length >= 12, `${question.id}: substantive prompt`);
  assert.equal(question.version, 1);
}
// The base deck is non-explicit; only the intimacy dimension carries sensitive wording.
for (const question of CHEMISTRY_QUESTIONS) {
  assert.equal(
    question.intimate,
    question.dimension === "intimacy",
    `${question.id}: intimacy flag`,
  );
}

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

assert.deepEqual(production.send_email, [
  { name: "ACCOUNT_EMAIL", allowed_sender_addresses: ["accounts@cheapseggs.com"] },
]);
assert.equal(production.vars.AUTH_EMAIL_FROM, "accounts@cheapseggs.com");
assert.equal(production.vars.AUTH_EMAIL_ENABLED, "true");
assert.equal(production.vars.BETTER_AUTH_SECRET, undefined);
assert.equal(local.send_email, undefined, "local development must never send real email");
assert.deepEqual(production.compatibility_flags, ["nodejs_compat"]);
