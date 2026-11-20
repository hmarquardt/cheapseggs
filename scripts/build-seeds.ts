import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  CATALOG_VERSION,
  DISCOVERY_CATEGORIES,
  DISCOVERY_ENTRIES,
  DISCOVERY_SUPPLIES,
  DISCOVERY_WHEELS,
  type DiscoveryEntry,
  MAX_PUBLISHED_HEAT,
} from "../src/content/discovery/catalog.ts";
import { PUBLIC_ACTIVITY_VERSIONS } from "../src/content/discovery/public-access.ts";
import { COOKBOOK } from "../src/content/recipes/cookbook.ts";
import { type Activity, activitySchema } from "../src/domain/catalog.ts";
import { SLOT_PHASE } from "../src/domain/recipes.ts";

/**
 * Compiles the reviewed editorial catalog and cookbook into idempotent seed SQL.
 *
 * Every rule here is a build gate: an unsafe, unreviewed or malformed entry stops the
 * pipeline instead of reaching D1. Run with `--check` to verify the committed seeds
 * still match this source (used by `npm run check`).
 */
const CATEGORY_IDS = new Set(DISCOVERY_CATEGORIES.map((category) => category.id));
const SUPPLY_IDS = new Set(DISCOVERY_SUPPLIES.map((supply) => supply.id));
const OPT_IN_CATEGORIES = new Set(
  DISCOVERY_CATEGORIES.filter((category) => category.requiredOptIn).map((category) => category.id),
);
const PUBLIC_KEYS = new Set(PUBLIC_ACTIVITY_VERSIONS.map(([id, version]) => `${id}@${version}`));

/** Categories whose consent prefix an entry implicitly carries. */
function requiredCategories(entry: DiscoveryEntry): string[] {
  return [...new Set([entry.category, ...entry.requiredOptIns])]
    .filter((id) => OPT_IN_CATEGORIES.has(id))
    .sort();
}

/**
 * Editorial lint, not a content certification. It catches obvious explicit terms in
 * public copy; professional review remains a separate documented gate.
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

function validateCatalog(): void {
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
    const listed = PUBLIC_KEYS.has(`${entry.id}@${entry.version}`);
    if (activity.status === "published") {
      assert.ok(listed, `${where}: published but absent from the reviewed public manifest`);
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
    } else {
      assert.ok(!listed, `${where}: unpublished entry must not be in the public manifest`);
    }
    if (entry.id.startsWith("draft-")) {
      assert.equal(activity.status, "draft", `${where}: draft-* entries must stay unpublished`);
      assert.equal(activity.heat, 3, `${where}: draft-* entries belong to the restricted tier`);
    }
  }
  // Every manifest entry must exist at exactly that version. A typo must not silently
  // publish nothing while looking like a reviewed list.
  for (const [id, version] of PUBLIC_ACTIVITY_VERSIONS) {
    const entry = DISCOVERY_ENTRIES.find((candidate) => candidate.id === id);
    assert.ok(entry, `manifest ${id}@${version}: missing from the catalog`);
    assert.equal(entry.version, version, `manifest ${id}@${version}: version drift`);
    assert.equal(entry.status, "published", `manifest ${id}@${version}: not published`);
  }
  assert.equal(
    PUBLIC_ACTIVITY_VERSIONS.length,
    DISCOVERY_ENTRIES.filter((entry) => entry.status === "published").length,
    "public manifest and published entries disagree",
  );
}
function validateWheels(): void {
  const ids = new Set<string>();
  const published = new Map(
    DISCOVERY_ENTRIES.filter((entry) => entry.status === "published").map((entry) => [
      entry.id,
      entry,
    ]),
  );
  for (const wheel of DISCOVERY_WHEELS) {
    assert.match(wheel.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `wheel ${wheel.id}: invalid id`);
    assert.ok(!ids.has(wheel.id), `wheel ${wheel.id}: duplicate id`);
    ids.add(wheel.id);
    assert.ok(
      wheel.segmentIds.length >= wheel.shortlistSize,
      `wheel ${wheel.id}: too few segments`,
    );
    assert.ok(
      wheel.title.length <= 60 && wheel.description.length <= 200,
      `wheel ${wheel.id}: copy length`,
    );
    for (const id of wheel.segmentIds) {
      const entry = published.get(id);
      assert.ok(entry, `wheel ${wheel.id}: segment ${id} is not published`);
      assert.ok(PUBLIC_KEYS.has(`${id}@${entry.version}`), `wheel ${wheel.id}: ${id} not public`);
      assert.ok(entry.heat <= MAX_PUBLISHED_HEAT, `wheel ${wheel.id}: ${id} above heat gate`);
    }
  }
  assert.ok(
    DISCOVERY_WHEELS.some((wheel) => wheel.id === "misfortune"),
    "the flagship wheel must exist",
  );
}

function validateCookbook(): void {
  const published = new Map(
    DISCOVERY_ENTRIES.filter((entry) => entry.status === "published").map((entry) => [
      entry.id,
      entry,
    ]),
  );
  const ids = new Set<string>();
  const titles = new Set<string>();
  let publicRecipes = 0;
  for (const recipe of COOKBOOK) {
    const where = `recipe ${recipe.id}`;
    assert.match(recipe.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${where}: invalid id`);
    assert.ok(!ids.has(recipe.id), `${where}: duplicate id`);
    ids.add(recipe.id);
    assert.ok(!titles.has(recipe.title), `${where}: duplicate title`);
    titles.add(recipe.title);
    assert.ok(recipe.title.length <= 60, `${where}: title length`);
    assert.ok(recipe.subtitle.length >= 10 && recipe.subtitle.length <= 90, `${where}: subtitle`);
    assert.ok(recipe.intro.length >= 60 && recipe.intro.length <= 260, `${where}: intro`);
    assert.ok(recipe.closing.length >= 10 && recipe.closing.length <= 160, `${where}: closing`);
    assert.ok(recipe.steps.length >= 3 && recipe.steps.length <= 8, `${where}: step count`);
    assert.ok(
      recipe.minimumMinutes >= 10 &&
        recipe.minimumMinutes <= recipe.maximumMinutes &&
        recipe.maximumMinutes <= 240,
      `${where}: duration bounds`,
    );
    assert.ok(
      recipe.preparationMinutes >= 0 && recipe.preparationMinutes <= recipe.minimumMinutes,
      `${where}: preparation budget`,
    );
    assert.ok(recipe.environments.length > 0, `${where}: environments`);
    for (const supply of recipe.supplies) assert.ok(SUPPLY_IDS.has(supply), `${where}: supply`);
    for (const optIn of recipe.requiredOptIns)
      assert.ok(CATEGORY_IDS.has(optIn), `${where}: opt-in`);
    assert.ok(recipe.preparation.length > 0, `${where}: preparation copy`);

    const implied = new Set<string>();
    let lastPosition = -1;
    for (const step of recipe.steps) {
      assert.equal(step.position, lastPosition + 1, `${where}: positions must be contiguous`);
      lastPosition = step.position;
      assert.ok(step.guidance.length >= 20 && step.guidance.length <= 140, `${where}: guidance`);
      assert.ok(step.maxMinutes >= 5 && step.maxMinutes <= 60, `${where}: slot ceiling`);
      const refs = [step.primary, ...step.alternatives];
      assert.equal(new Set(refs.map(([id]) => id)).size, refs.length, `${where}: duplicate option`);
      for (const [id, version] of refs) {
        const entry = published.get(id);
        assert.ok(entry, `${where}: ${id} is not a published activity`);
        assert.equal(entry.version, version, `${where}: ${id} version drift`);
        assert.ok(PUBLIC_KEYS.has(`${id}@${version}`), `${where}: ${id} is not public`);
        assert.ok(
          entry.phases.includes(SLOT_PHASE[step.slot]),
          `${where}: ${id} cannot fill the ${step.slot} slot`,
        );
        for (const category of requiredCategories(entry)) implied.add(category);
      }
    }
    // The recipe must declare at least every consent prefix its own options carry.
    for (const category of implied)
      assert.ok(
        recipe.requiredOptIns.includes(category),
        `${where}: requires a ${category} opt-in it does not declare`,
      );
    if (recipe.status === "published") {
      publicRecipes++;
      assert.equal(recipe.accessTier, "public_preview", `${where}: published recipes are public`);
    } else {
      assert.equal(recipe.accessTier, "restricted", `${where}: drafts stay restricted`);
    }
  }
  assert.ok(
    publicRecipes >= 8 && publicRecipes <= 12,
    `published cookbook needs 8-12 recipes, found ${publicRecipes}`,
  );
}
function sql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function renderHeader(): string {
  const published = DISCOVERY_ENTRIES.filter((entry) => entry.status === "published");
  const drafts = DISCOVERY_ENTRIES.filter((entry) => entry.status === "draft");
  return [
    "-- Generated by scripts/build-seeds.ts from the typed editorial source. Do not edit.",
    `-- Catalog ${CATALOG_VERSION}.`,
    `-- Immutable activity versions: ${DISCOVERY_ENTRIES.length} total, ${published.length} published,`,
    `-- ${drafts.length} unreviewed draft (never served, never on a public wheel).`,
    `-- Public wheels: ${DISCOVERY_WHEELS.length}; published recipes: ${
      COOKBOOK.filter((recipe) => recipe.status === "published").length
    }.`,
    "-- Idempotent: published activity rows are never rewritten in place. Category",
    "-- taxonomy and wheel presentation are upserted so stale consent gates or draw",
    "-- modes cannot survive in an existing database.",
    "",
  ].join("\n");
}

function renderSeed(): string {
  const published = DISCOVERY_ENTRIES.filter((entry) => entry.status === "published");
  const lines: string[] = [renderHeader()];
  lines.push("INSERT OR IGNORE INTO categories(id,title,required_opt_in,blurb) VALUES");
  lines.push(
    `${DISCOVERY_CATEGORIES.map(
      (category) =>
        `  (${sql(category.id)},${sql(category.title)},${category.requiredOptIn ? 1 : 0},${sql(category.blurb)})`,
    ).join(",\n")}
ON CONFLICT(id) DO UPDATE SET title = excluded.title, required_opt_in = excluded.required_opt_in, blurb = excluded.blurb;`,
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
        sql(PUBLIC_KEYS.has(`${entry.id}@${entry.version}`) ? "public_preview" : "restricted"),
      ].join(",")})`;
    }).join(",\n")};`,
    "",
    "INSERT INTO wheels(id,version,title,selection_policy,status,tagline,description,draw_mode,shortlist_size) VALUES",
    `${DISCOVERY_WHEELS.map(
      (wheel) =>
        `  (${sql(wheel.id)},${wheel.version},${sql(wheel.title)},${sql(
          wheel.selectionPolicy,
        )},'published',${sql(wheel.tagline)},${sql(wheel.description)},${sql(
          wheel.drawMode,
        )},${wheel.shortlistSize})`,
    ).join(",\n")},
  ('chemistry-preview',1,'Good Chemistry','uniform','draft','','','single',8)
ON CONFLICT(id,version) DO UPDATE SET title = excluded.title,
  selection_policy = excluded.selection_policy, status = excluded.status,
  tagline = excluded.tagline, description = excluded.description,
  draw_mode = excluded.draw_mode, shortlist_size = excluded.shortlist_size;`,
    "",
    "INSERT OR IGNORE INTO wheel_segments(wheel_id,wheel_version,activity_id,activity_version) VALUES",
  );
  const segmentValues = DISCOVERY_WHEELS.flatMap((wheel) =>
    wheel.segmentIds.map((id) => {
      const entry = published.find((candidate) => candidate.id === id);
      if (!entry) throw new Error(`wheel ${wheel.id}: missing published ${id}`);
      return `  (${sql(wheel.id)},${wheel.version},${sql(id)},${entry.version})`;
    }),
  );
  segmentValues.push(
    "  ('chemistry-preview',1,'playlist',1)",
    "  ('chemistry-preview',1,'compliments',1)",
    "  ('chemistry-preview',1,'slow-dance',1)",
  );
  lines.push(`${segmentValues.join(",\n")};`, "");
  lines.push(
    "INSERT OR IGNORE INTO recipe_templates(id,version,title,metadata_json,status,pack_id,access_tier,public_preview) VALUES",
    `${COOKBOOK.map((recipe) => {
      const metadata = {
        subtitle: recipe.subtitle,
        intro: recipe.intro,
        mood: recipe.mood,
        heatBand: recipe.heatBand,
        experimentationBand: recipe.experimentationBand,
        minimumMinutes: recipe.minimumMinutes,
        maximumMinutes: recipe.maximumMinutes,
        environments: recipe.environments,
        preparationMinutes: recipe.preparationMinutes,
        supplies: recipe.supplies,
        preparation: recipe.preparation,
        closing: recipe.closing,
        requiredOptIns: recipe.requiredOptIns,
      };
      return `  (${[
        sql(recipe.id),
        recipe.version,
        sql(recipe.title),
        sql(JSON.stringify(metadata)),
        sql(recipe.status),
        recipe.packId === null ? "NULL" : sql(recipe.packId),
        sql(recipe.accessTier),
        recipe.status === "published" && recipe.accessTier === "public_preview" ? 1 : 0,
      ].join(",")})`;
    }).join(",\n")};`,
    "",
    "INSERT OR IGNORE INTO recipe_steps(recipe_id,recipe_version,position,phase,activity_id,activity_version,slot,optional,guidance,alternatives_json,max_minutes) VALUES",
    `${COOKBOOK.flatMap((recipe) =>
      recipe.steps.map(
        (step) =>
          `  (${[
            sql(recipe.id),
            recipe.version,
            step.position,
            sql(SLOT_PHASE[step.slot]),
            sql(step.primary[0]),
            step.primary[1],
            sql(step.slot),
            step.optional ? 1 : 0,
            sql(step.guidance),
            sql(JSON.stringify(step.alternatives.map(([id, version]) => ({ id, version })))),
            step.maxMinutes,
          ].join(",")})`,
      ),
    ).join(",\n")};`,
    "",
  );
  return lines.join("\n");
}

const TARGETS = ["seeds/local.sql", "seeds/production.sql"] as const;
const checkOnly = process.argv.includes("--check");

validateCatalog();
validateWheels();
validateCookbook();
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
    `Catalog seed check passed: ${DISCOVERY_ENTRIES.length} immutable versions, ${DISCOVERY_WHEELS.length} public wheels, ${COOKBOOK.length} recipes, ${TARGETS.length} seed files match.`,
  );
} else {
  for (const target of TARGETS) writeFileSync(target, rendered);
  console.log(
    `Wrote ${DISCOVERY_ENTRIES.length} catalog versions, ${DISCOVERY_WHEELS.length} wheels and ${COOKBOOK.length} recipes to ${TARGETS.join(" and ")} (${CATALOG_VERSION}).`,
  );
}
