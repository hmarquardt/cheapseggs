import type { Activity } from "../domain/catalog";
import {
  MOODS,
  type RecipeDefinition,
  type RecipeStepDefinition,
  SLOT_KINDS,
  type SlotKind,
} from "../domain/recipes";
import { loadPublicActivities, type PublicActivitySet } from "./wheel.ts";

/**
 * Read-side of the Romance Cookbook. Recipes are versioned catalog rows, and every
 * activity reference is resolved against the *public* activity set loaded by the same
 * `access_tier`/`status` gate the wheel uses. A malformed, unpublished or non-public
 * recipe is dropped rather than served.
 */
export interface RecipeRow {
  id: string;
  version: number;
  title: string;
  metadata_json: string;
  status: string;
  pack_id: string | null;
  access_tier: string;
  public_preview: number;
}

export interface RecipeStepRow {
  recipe_id: string;
  recipe_version: number;
  position: number;
  phase: string;
  activity_id: string;
  activity_version: number;
  slot: string;
  optional: number;
  guidance: string;
  alternatives_json: string;
  max_minutes: number;
}

interface RecipeMetadata {
  subtitle: string;
  intro: string;
  mood: string;
  heatBand: [number, number];
  experimentationBand: [number, number];
  minimumMinutes: number;
  maximumMinutes: number;
  environments: string[];
  preparationMinutes: number;
  supplies: string[];
  preparation: string[];
  closing: string;
  requiredOptIns: string[];
}

function referenceList(value: string): { id: string; version: number }[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const refs: { id: string; version: number }[] = [];
    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) return null;
      const record = entry as { id?: unknown; version?: unknown };
      if (typeof record.id !== "string" || typeof record.version !== "number") return null;
      if (!/^[a-z0-9-]{1,60}$/.test(record.id) || !Number.isSafeInteger(record.version))
        return null;
      refs.push({ id: record.id, version: record.version });
    }
    return refs;
  } catch {
    return null;
  }
}
function parseMetadata(value: string): RecipeMetadata | null {
  try {
    const parsed = JSON.parse(value) as Partial<RecipeMetadata>;
    if (typeof parsed !== "object" || parsed === null) return null;
    const bands =
      Array.isArray(parsed.heatBand) &&
      parsed.heatBand.length === 2 &&
      parsed.heatBand.every((entry) => Number.isInteger(entry)) &&
      Array.isArray(parsed.experimentationBand) &&
      parsed.experimentationBand.length === 2 &&
      parsed.experimentationBand.every((entry) => Number.isInteger(entry));
    if (!bands) return null;
    const strings = ["subtitle", "intro", "mood", "closing"] as const;
    for (const key of strings)
      if (typeof parsed[key] !== "string" || (parsed[key] as string).length === 0) return null;
    const numbers = ["minimumMinutes", "maximumMinutes", "preparationMinutes"] as const;
    for (const key of numbers)
      if (!Number.isSafeInteger(parsed[key]) || (parsed[key] as number) < 0) return null;
    const arrays = ["environments", "supplies", "preparation", "requiredOptIns"] as const;
    for (const key of arrays) {
      const list = parsed[key];
      if (!Array.isArray(list) || !list.every((entry) => typeof entry === "string")) return null;
    }
    return parsed as RecipeMetadata;
  } catch {
    return null;
  }
}

function buildRecipe(
  row: RecipeRow,
  steps: readonly RecipeStepRow[],
  activities: ReadonlyMap<string, Activity>,
): RecipeDefinition | null {
  if (
    row.status !== "published" ||
    row.access_tier !== "public_preview" ||
    row.public_preview !== 1
  )
    return null;
  const metadata = parseMetadata(row.metadata_json);
  if (!metadata) return null;
  if (!(MOODS as readonly string[]).includes(metadata.mood)) return null;
  if (steps.length === 0) return null;

  const definitions: RecipeStepDefinition[] = [];
  for (const step of [...steps].sort((left, right) => left.position - right.position)) {
    if (!(SLOT_KINDS as readonly string[]).includes(step.slot)) return null;
    if (!Number.isSafeInteger(step.position) || step.position !== definitions.length) return null;
    const primary = activities.get(`${step.activity_id}@${step.activity_version}`);
    if (!primary) return null;
    const alternatives = referenceList(step.alternatives_json);
    if (!alternatives) return null;
    const resolved: [string, number][] = [];
    for (const alternative of alternatives) {
      if (!activities.has(`${alternative.id}@${alternative.version}`)) return null;
      resolved.push([alternative.id, alternative.version]);
    }
    definitions.push({
      position: step.position,
      slot: step.slot as SlotKind,
      optional: step.optional === 1,
      guidance: step.guidance,
      primary: [primary.id, primary.version],
      alternatives: resolved,
      maxMinutes: step.max_minutes,
    });
  }

  return {
    id: row.id,
    version: row.version,
    title: row.title,
    subtitle: metadata.subtitle,
    intro: metadata.intro,
    mood: metadata.mood as RecipeDefinition["mood"],
    heatBand: metadata.heatBand,
    experimentationBand: metadata.experimentationBand,
    minimumMinutes: metadata.minimumMinutes,
    maximumMinutes: metadata.maximumMinutes,
    environments: metadata.environments as RecipeDefinition["environments"],
    preparationMinutes: metadata.preparationMinutes,
    supplies: metadata.supplies,
    preparation: metadata.preparation,
    closing: metadata.closing,
    requiredOptIns: metadata.requiredOptIns,
    steps: definitions,
    accessTier: "public_preview",
    status: "published",
    packId: row.pack_id,
  };
}

export interface RecipeCatalog {
  recipes: RecipeDefinition[];
  activities: Map<string, Activity>;
  categories: PublicActivitySet["categories"];
}

/** Loads every served recipe. The row count is small and bounded by the build. */
export async function loadRecipes(db: D1Database): Promise<RecipeCatalog> {
  const { activities, categories } = await loadPublicActivities(db);
  const byKey = new Map(
    activities.map((activity) => [`${activity.id}@${activity.version}`, activity]),
  );
  const [{ results: recipeRows }, { results: stepRows }] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM recipe_templates
         WHERE status = 'published' AND access_tier = 'public_preview' AND public_preview = 1
         ORDER BY id`,
      )
      .all<RecipeRow>(),
    db
      .prepare("SELECT * FROM recipe_steps ORDER BY recipe_id, recipe_version, position")
      .all<RecipeStepRow>(),
  ]);
  const stepsByRecipe = new Map<string, RecipeStepRow[]>();
  for (const step of stepRows) {
    const key = `${step.recipe_id}@${step.recipe_version}`;
    const list = stepsByRecipe.get(key) ?? [];
    list.push(step);
    stepsByRecipe.set(key, list);
  }
  const recipes: RecipeDefinition[] = [];
  for (const row of recipeRows) {
    const built = buildRecipe(row, stepsByRecipe.get(`${row.id}@${row.version}`) ?? [], byKey);
    if (built) recipes.push(built);
  }
  return { recipes, activities: byKey, categories };
}
