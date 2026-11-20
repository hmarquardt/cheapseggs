import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  CATALOG_VERSION,
  DISCOVERY_CATEGORIES,
  DISCOVERY_ENTRIES,
  DISCOVERY_SUPPLIES,
  DISCOVERY_WHEEL,
  type DiscoveryEntry,
  MAX_PUBLISHED_HEAT,
} from "../src/content/discovery/catalog.ts";
import { PUBLIC_ACTIVITY_VERSIONS } from "../src/content/discovery/public-access.ts";
import { type Activity, activitySchema } from "../src/domain/catalog.ts";

/**
 * Compiles the reviewed editorial catalog into idempotent seed SQL.
 *
 * Every rule here is a build gate: an unsafe, unreviewed or malformed entry stops
 * the pipeline instead of reaching D1. Run with `--check` to verify the committed
 * seeds still match this source (used by `npm run check`).
 */
const CATEGORY_IDS = new Set(DISCOVERY_CATEGORIES.map((category) => category.id));
const SUPPLY_IDS = new Set(DISCOVERY_SUPPLIES.map((supply) => supply.id));

/**
 * Editorial lint, not a content certification. It catches obvious explicit terms
 * in the public catalog; real review is a separate documented gate.
 */
const DISALLOWED_PUBLIC_TERMS = [
  "porn",
  "orgasm",
  "penis",
  "vagina",
  "genital",
  "nipple",
  "clitoris",
  "anal",
  "cum",
  "fuck",
  "blow job",
  "naked",
  "nude",
];

function toActivity(entry: DiscoveryEntry): Activity {
  return {
    id: entry.id,
    version: entry.version,
    title: entry.title,
    description: entry.description,
    category: entry.category,
    tags: entry.tags,
    heat: entry.heat,
    experimentation: entry.experimentation,
    energy: entry.energy,
    durationMinutes: entry.durationMinutes,
    environments: entry.environments,
    supplies: entry.supplies,
    preparation: entry.preparation,
    accessibility: entry.accessibility,
    safetyFlags: entry.safetyFlags,
    requiredOptIns: entry.requiredOptIns,
    incompatibleWith: entry.incompatibleWith,
    phases: entry.phases,
    status: entry.status,
    packId: entry.packId ?? null,
  };
}

function validate(): void {
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  for (const entry of DISCOVERY_ENTRIES) {
    const where = `entry ${entry.id}`;
    assert.match(entry.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${where}: invalid id`);
    assert.ok(!seenIds.has(entry.id), `${where}: duplicate id`);
    seenIds.add(entry.id);
    assert.ok(entry.version >= 1 && Number.isInteger(entry.version), `${where}: invalid version`);
    assert.ok(!seenTitles.has(entry.title), `${where}: duplicate title`);
    seenTitles.add(entry.title);
    assert.ok(entry.title.length >= 3 && entry.title.length <= 60, `${where}: title length`);
    assert.ok(
      entry.description.length >= 20 && entry.description.length <= 240,
      `${where}: description length`,
    );
    assert.ok(entry.durationMinutes >= 5 && entry.durationMinutes <= 240, `${where}: duration`);
    assert.ok(CATEGORY_IDS.has(entry.category), `${where}: unknown category`);
    assert.ok(entry.environments.length > 0, `${where}: no environment`);
    assert.ok(entry.phases.length > 0, `${where}: no phase`);
    for (const supply of entry.supplies) assert.ok(SUPPLY_IDS.has(supply), `${where}: supply`);
    for (const optIn of entry.requiredOptIns)
      assert.ok(CATEGORY_IDS.has(optIn), `${where}: opt-in`);
    assert.ok(!entry.incompatibleWith.includes(entry.id), `${where}: self-incompatible`);
    const activity = activitySchema.parse(toActivity(entry));
    if (activity.status === "published") {
      assert.ok(
        activity.heat <= MAX_PUBLISHED_HEAT,
        `${where}: published above the reviewed heat gate`,
      );
      const text = [
        activity.title,
        activity.description,
        ...activity.preparation,
        ...activity.safetyFlags,
      ]
        .join(" ")
        .toLowerCase();
      for (const term of DISALLOWED_PUBLIC_TERMS)
        assert.ok(!text.includes(term), `${where}: explicit term "${term}" in public copy`);
    }
    if (entry.publicPreview) {
      assert.equal(entry.status, "published", `${where}: preview must be published`);
      assert.equal(activity.heat, 0, `${where}: preview must be heat 0`);
      assert.equal(activity.packId, null, `${where}: preview must be free`);
    }
  }

  const published = DISCOVERY_ENTRIES.filter((entry) => entry.status === "published");
  const drafts = DISCOVERY_ENTRIES.filter((entry) => entry.status !== "published");
  assert.ok(published.length >= 40 && published.length <= 60, "published catalog size");
  assert.equal(DISCOVERY_ENTRIES.filter((entry) => entry.publicPreview).length, 3, "previews");
  assert.deepEqual(
    published
      .filter((entry) => entry.publicPreview)
      .map((entry) => entry.id)
      .sort(),
    ["compliments", "playlist", "slow-dance"],
    "public preview fixtures changed",
  );
  assert.ok(drafts.length > 0, "draft backlog keeps the content gate testable");
  for (const category of DISCOVERY_CATEGORIES)
    assert.ok(
      published.some((entry) => entry.category === category.id),
      `category ${category.id} has no published entry`,
    );

  // Every published entry is on the wheel; no draft entry ever is.
  const segments = published.map((entry) => entry.id);
  assert.equal(new Set(segments).size, segments.length, "duplicate wheel segment");
  for (const draft of drafts) assert.ok(!segments.includes(draft.id), "draft on wheel");
  assert.equal(DISCOVERY_WHEEL.selectionPolicy, "uniform", "unreviewed weighted wheel");
  assert.ok(DISCOVERY_WHEEL.shortlistSize >= 2 && DISCOVERY_WHEEL.shortlistSize <= 12);
}

function sql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function renderHeader(): string {
  const published = DISCOVERY_ENTRIES.filter((entry) => entry.status === "published");
  const drafts = DISCOVERY_ENTRIES.filter((entry) => entry.status !== "published");
  return [
    "-- GENERATED FILE. Do not edit by hand: run `npm run seeds:build`.",
    `-- Source: src/content/discovery/catalog.ts (${CATALOG_VERSION})`,
    `-- Immutable catalog versions: ${DISCOVERY_ENTRIES.length} total, ${published.length} published,`,
    `-- ${drafts.length} unreviewed draft (never served, never on the wheel).`,
    "-- Idempotent: published activity rows are never rewritten in place. Category",
    "-- taxonomy (title, opt-in requirement) is upserted so an existing database",
    "-- cannot keep a stale consent gate.",
    "",
  ].join("\n");
}

function renderSeed(): string {
  const lines: string[] = [renderHeader()];
  lines.push("INSERT OR IGNORE INTO categories(id,title,required_opt_in) VALUES");
  lines.push(
    `${DISCOVERY_CATEGORIES.map(
      (category) =>
        `  (${sql(category.id)},${sql(category.title)},${category.requiredOptIn ? 1 : 0})`,
    ).join(",\n")}
ON CONFLICT(id) DO UPDATE SET title = excluded.title, required_opt_in = excluded.required_opt_in;`,
    "",
    "INSERT OR IGNORE INTO activities(id) VALUES",
    `${DISCOVERY_ENTRIES.map((entry) => `  (${sql(entry.id)})`).join(",\n")};`,
    "",
    "INSERT OR IGNORE INTO activity_versions(activity_id,version,title,description,category_id,heat,experimentation,energy,duration_minutes,metadata_json,status,pack_id,public_preview,access_tier) VALUES",
  );
  lines.push(
    `${DISCOVERY_ENTRIES.map((entry) => {
      const metadata = {
        tags: entry.tags,
        environments: entry.environments,
        supplies: entry.supplies,
        preparation: entry.preparation,
        accessibility: entry.accessibility,
        safetyFlags: entry.safetyFlags,
        requiredOptIns: entry.requiredOptIns,
        incompatibleWith: entry.incompatibleWith,
        phases: entry.phases,
      };
      return `  (${[
        sql(entry.id),
        entry.version,
        sql(entry.title),
        sql(entry.description),
        sql(entry.category),
        entry.heat,
        entry.experimentation,
        entry.energy,
        entry.durationMinutes,
        sql(JSON.stringify(metadata)),
        sql(entry.status),
        "NULL",
        entry.publicPreview ? 1 : 0,
        sql(
          PUBLIC_ACTIVITY_VERSIONS.some(
            ([id, version]) => id === entry.id && version === entry.version,
          )
            ? "public_preview"
            : "restricted",
        ),
      ].join(",")})`;
    }).join(",\n")};`,
    "",
    "INSERT OR IGNORE INTO wheels(id,version,title,selection_policy,status) VALUES",
    `  (${sql(DISCOVERY_WHEEL.id)},${DISCOVERY_WHEEL.version},${sql(DISCOVERY_WHEEL.title)},${sql(DISCOVERY_WHEEL.selectionPolicy)},'published'),`,
    "  ('chemistry-preview',1,'Good Chemistry','uniform','draft');",
    "",
    "INSERT OR IGNORE INTO wheel_segments(wheel_id,wheel_version,activity_id,activity_version) VALUES",
    `${[
      ...DISCOVERY_ENTRIES.filter((entry) => entry.status === "published").map(
        (entry) =>
          `  (${sql(DISCOVERY_WHEEL.id)},${DISCOVERY_WHEEL.version},${sql(entry.id)},${entry.version})`,
      ),
      "  ('chemistry-preview',1,'playlist',1)",
      "  ('chemistry-preview',1,'compliments',1)",
      "  ('chemistry-preview',1,'slow-dance',1)",
    ].join(",\n")};`,
    "",
  );
  return lines.join("\n");
}

const TARGETS = ["seeds/local.sql", "seeds/production.sql"] as const;
const checkOnly = process.argv.includes("--check");

validate();
const rendered = renderSeed();

if (checkOnly) {
  for (const target of TARGETS) {
    assert.ok(existsSync(target), `${target} is missing; run npm run seeds:build`);
    assert.equal(
      readFileSync(target, "utf8"),
      rendered,
      `${target} is stale; run npm run seeds:build`,
    );
  }
  console.log(
    `Catalog seed check passed: ${DISCOVERY_ENTRIES.length} immutable versions, ${DISCOVERY_WHEEL.id}@${DISCOVERY_WHEEL.version}, ${TARGETS.length} seed files match.`,
  );
} else {
  for (const target of TARGETS) writeFileSync(target, rendered);
  console.log(
    `Wrote ${DISCOVERY_ENTRIES.length} catalog versions to ${TARGETS.join(" and ")} (${CATALOG_VERSION}).`,
  );
}
