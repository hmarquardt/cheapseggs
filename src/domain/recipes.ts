import { z } from "zod";
import type { Activity, EligibilityContext } from "./catalog.ts";
import { eligibleActivities } from "./eligibility.ts";
import { randomBelow, selectWeighted } from "./random.ts";
import {
  DURATION_OPTIONS,
  ENERGY_OPTIONS,
  ENVIRONMENT_OPTIONS,
  EXPERIMENTATION_OPTIONS,
  HEAT_OPTIONS,
  type WheelCategory,
  type WheelSupply,
} from "./wheel.ts";

/** Display roles in an evening. `phase` is the catalog phase each role draws from. */
export const SLOT_KINDS = [
  "preparation",
  "atmosphere",
  "warm-up",
  "main",
  "surprise",
  "finale",
] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

export const SLOT_PHASE: Readonly<Record<SlotKind, Activity["phases"][number]>> = {
  preparation: "setup",
  atmosphere: "setup",
  "warm-up": "warm-up",
  main: "main",
  surprise: "main",
  finale: "reconnect",
};

export const SLOT_LABEL: Readonly<Record<SlotKind, string>> = {
  preparation: "Preparation",
  atmosphere: "Atmosphere",
  "warm-up": "Warm-up",
  main: "Main course",
  surprise: "Optional surprise",
  finale: "Finale",
};

export const MOODS = ["romantic", "playful", "adventurous"] as const;
const MAX_BODY_ITEMS = 16;

type Uint32Source = () => number;

/** Only public, server-derived facts are accepted; identity and entitlements never are. */
export const eveningConfigSchema = z.strictObject({
  mood: z.enum(MOODS),
  heat: z.enum(["mild", "medium", "spicy", "habanero"]),
  experimentation: z.enum(["classic", "curious", "adventurous"]),
  energy: z.enum(["low", "moderate", "high"]),
  duration: z.enum(["quickie", "30-minutes", "hour", "all-evening"]),
  environment: z.enum(["home", "hotel", "getaway", "private-other"]),
  supplies: z.array(z.string().min(1).max(40)).max(MAX_BODY_ITEMS).default([]),
  optIns: z.array(z.string().min(1).max(40)).max(MAX_BODY_ITEMS).default([]),
  excludedCategories: z.array(z.string().min(1).max(40)).max(MAX_BODY_ITEMS).default([]),
  excludedActivities: z.array(z.string().min(1).max(60)).max(60).default([]),
});
export type EveningConfig = z.infer<typeof eveningConfigSchema>;

const referenceSchema = z.strictObject({
  position: z.number().int().min(0).max(11),
  activityId: z.string().regex(/^[a-z0-9-]{1,60}$/),
  version: z.number().int().positive(),
});

export const planRequestSchema = z.strictObject({
  config: eveningConfigSchema,
  recipeId: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional(),
  keep: z.array(referenceSchema).max(12).default([]),
  avoid: z
    .array(z.string().regex(/^[a-z0-9-]{1,60}$/))
    .max(40)
    .default([]),
});
export type PlanRequest = z.infer<typeof planRequestSchema>;

export const stepRequestSchema = z.strictObject({
  config: eveningConfigSchema,
  recipeId: z.string().regex(/^[a-z0-9-]{1,60}$/),
  recipeVersion: z.number().int().positive(),
  steps: z.array(referenceSchema).min(1).max(12),
  targetPosition: z.number().int().min(0).max(11),
  chosenActivityId: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional(),
  avoid: z
    .array(z.string().regex(/^[a-z0-9-]{1,60}$/))
    .max(40)
    .default([]),
});
export type StepRequest = z.infer<typeof stepRequestSchema>;

export type CatalogRef = readonly [id: string, version: number];

export interface RecipeStepDefinition {
  position: number;
  slot: SlotKind;
  optional: boolean;
  /** Slot direction, in the house voice. Never an instruction to perform anything. */
  guidance: string;
  primary: CatalogRef;
  alternatives: readonly CatalogRef[];
  /** Pacing ceiling for this slot, in minutes. */
  maxMinutes: number;
}

export interface RecipeDefinition {
  id: string;
  version: number;
  title: string;
  subtitle: string;
  intro: string;
  mood: (typeof MOODS)[number];
  heatBand: readonly [number, number];
  experimentationBand: readonly [number, number];
  minimumMinutes: number;
  maximumMinutes: number;
  /** Settings this recipe was written for. It is never offered outside them. */
  environments: readonly Activity["environments"][number][];
  /** Estimated time for the shared preparation list, counted once. */
  preparationMinutes: number;
  supplies: readonly string[];
  preparation: readonly string[];
  closing: string;
  /** Categories whose opt-in the recipe cannot work without. Checked at build. */
  requiredOptIns: readonly string[];
  steps: readonly RecipeStepDefinition[];
  accessTier: "public_preview" | "restricted";
  status: "draft" | "published";
  packId: string | null;
}
export function heatLevel(key: EveningConfig["heat"]): number {
  return HEAT_OPTIONS.find((option) => option.key === key)?.level ?? 0;
}
export function experimentationLevel(key: EveningConfig["experimentation"]): number {
  return EXPERIMENTATION_OPTIONS.find((option) => option.key === key)?.level ?? 0;
}
export function energyLevel(key: EveningConfig["energy"]): number {
  return ENERGY_OPTIONS.find((option) => option.key === key)?.level ?? 0;
}
export function durationMinutes(key: EveningConfig["duration"]): number {
  return DURATION_OPTIONS.find((option) => option.key === key)?.minutes ?? 30;
}
export function environmentKey(key: EveningConfig["environment"]): string {
  return ENVIRONMENT_OPTIONS.find((option) => option.key === key)?.key ?? "home";
}

/** Same policy object the wheel uses; nothing here can widen a boundary. */
export function eveningEligibility(config: EveningConfig): EligibilityContext {
  return {
    mode: "discovery",
    maxHeat: heatLevel(config.heat),
    maxExperimentation: experimentationLevel(config.experimentation),
    maxEnergy: energyLevel(config.energy),
    availableMinutes: durationMinutes(config.duration),
    environment: environmentKey(config.environment) as EligibilityContext["environment"],
    supplies: new Set(config.supplies),
    excludedActivities: new Set(config.excludedActivities),
    excludedCategories: new Set(config.excludedCategories),
    optIns: new Set(config.optIns),
    accessiblePackIds: new Set(),
    recentActivityIds: new Set(),
    participantApprovals: [],
    relationshipActive: false,
  };
}

export interface RecipeFit {
  ok: boolean;
  reason?: "mood" | "heat" | "experimentation" | "time" | "environment" | "opt-in" | "empty-pool";
}

/**
 * A template is compatible only when every one of its own requirements is already
 * satisfied. Nothing is auto-opted-in and no ceiling is raised to make a recipe work.
 */
export function recipeFits(
  recipe: RecipeDefinition,
  config: EveningConfig,
  pool: readonly Activity[],
): RecipeFit {
  const budget = durationMinutes(config.duration);
  if (recipe.mood !== config.mood) return { ok: false, reason: "mood" };
  const heat = heatLevel(config.heat);
  if (heat < recipe.heatBand[0] || heat > recipe.heatBand[1]) return { ok: false, reason: "heat" };
  const experimentation = experimentationLevel(config.experimentation);
  if (
    experimentation < recipe.experimentationBand[0] ||
    experimentation > recipe.experimentationBand[1]
  )
    return { ok: false, reason: "experimentation" };
  if (budget < recipe.minimumMinutes || budget > recipe.maximumMinutes)
    return { ok: false, reason: "time" };
  if (
    !recipe.environments.includes(
      environmentKey(config.environment) as Activity["environments"][number],
    )
  )
    return { ok: false, reason: "environment" };
  const optIns = new Set(config.optIns);
  if (!recipe.requiredOptIns.every((optIn) => optIns.has(optIn)))
    return { ok: false, reason: "opt-in" };
  if (pool.length === 0) return { ok: false, reason: "empty-pool" };
  return { ok: true };
}

export function fittingRecipes(
  recipes: readonly RecipeDefinition[],
  config: EveningConfig,
  pool: readonly Activity[],
): RecipeDefinition[] {
  return recipes.filter(
    (recipe) => recipe.status === "published" && recipeFits(recipe, config, pool).ok,
  );
}

/** Prefers the requested (deep-linked) recipe only when it genuinely fits tonight. */
export function chooseRecipe(
  recipes: readonly RecipeDefinition[],
  config: EveningConfig,
  pool: readonly Activity[],
  preferredId: string | undefined,
  source?: Uint32Source,
): RecipeDefinition | null {
  const fitting = fittingRecipes(recipes, config, pool);
  if (fitting.length === 0) return null;
  const preferred = preferredId ? fitting.find((recipe) => recipe.id === preferredId) : undefined;
  if (preferred) return preferred;
  // Ingredients are a soft preference, never a silent boundary: a recipe that needs a
  // speaker can still be offered, and the plan lists what to fetch before starting.
  const supplies = new Set(config.supplies);
  return selectWeighted(
    fitting.map((recipe) => ({
      value: recipe,
      weight: recipe.supplies.every((supply) => supplies.has(supply)) ? 4 : 1,
    })),
    source,
  );
}
export type ComposeResult =
  | { ok: true; plan: ComposedPlan }
  | { ok: false; reason: "budget-exceeded" | "keep-ineligible" | "nothing-fits"; position: number };

export interface ComposedStep {
  definition: RecipeStepDefinition;
  activity: Activity;
  alternatives: Activity[];
}

export interface ComposedPlan {
  recipe: RecipeDefinition;
  steps: ComposedStep[];
  skipped: SlotKind[];
  preparationMinutes: number;
  plannedMinutes: number;
  budgetMinutes: number;
}

export interface ComposeOptions {
  recipe: RecipeDefinition;
  pool: readonly Activity[];
  config: EveningConfig;
  keep?: readonly { position: number; activityId: string; version: number }[];
  avoid?: ReadonlySet<string>;
  source?: Uint32Source;
}

function phaseCompatible(activity: Activity, slot: SlotKind): boolean {
  return activity.phases.includes(SLOT_PHASE[slot]);
}

/** Smallest plausible time this slot needs, used to protect later required steps. */
function minimumStepMinutes(definition: RecipeStepDefinition, pool: readonly Activity[]): number {
  const durations = [definition.primary, ...definition.alternatives]
    .map(([id, version]) => pool.find((entry) => entry.id === id && entry.version === version))
    .filter((entry): entry is Activity => Boolean(entry))
    .filter((entry) => entry.durationMinutes <= definition.maxMinutes)
    .map((entry) => entry.durationMinutes);
  return durations.length > 0 ? Math.min(...durations) : 5;
}

function orderedFor(
  definition: RecipeStepDefinition,
  pool: readonly Activity[],
  used: ReadonlySet<string>,
  avoid: ReadonlySet<string>,
  remaining: number,
): Activity[] {
  const fits = (activity: Activity) =>
    !used.has(activity.id) &&
    !avoid.has(activity.id) &&
    activity.durationMinutes <= remaining &&
    activity.durationMinutes <= definition.maxMinutes &&
    phaseCompatible(activity, definition.slot);
  const byId = new Map(pool.filter(fits).map((activity) => [activity.id, activity]));
  const ordered: Activity[] = [];
  for (const [id, version] of [definition.primary, ...definition.alternatives]) {
    const activity = byId.get(id);
    if (activity && activity.version === version) ordered.push(activity);
  }
  if (ordered.length > 0) return ordered;
  // Generic fallback inside the same phase and budget. It still has to pass eligibility.
  return pool.filter(fits).sort((left, right) => left.title.localeCompare(right.title));
}

function pickCandidate(
  candidates: readonly Activity[],
  source?: Uint32Source,
): Activity | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  const weighted = candidates.slice(0, 3).map((activity, index) => ({
    value: activity,
    weight: index === 0 ? 4 : index === 1 ? 2 : 1,
  }));
  return selectWeighted(weighted, source) ?? undefined;
}

/**
 * Composes a coherent evening from a template. Every step comes from the already
 * eligibility-filtered pool, the total (including preparation) must fit the time
 * budget, and a slot that cannot be filled fails the plan instead of relaxing a limit.
 */
export function composePlan(options: ComposeOptions): ComposeResult {
  const { recipe, pool, config, source } = options;
  const budget = durationMinutes(config.duration);
  const keep = new Map((options.keep ?? []).map((entry) => [entry.position, entry] as const));
  const avoid = options.avoid ?? new Set<string>();
  const used = new Set<string>();
  const steps: ComposedStep[] = [];
  const skipped: SlotKind[] = [];
  let planned = recipe.preparationMinutes;

  if (planned > budget) return { ok: false, reason: "budget-exceeded", position: -1 };

  const reserveAfter = (index: number): number => {
    let total = 0;
    for (const later of recipe.steps.slice(index + 1)) {
      const kept = keep.get(later.position);
      if (kept) {
        const activity = pool.find(
          (entry) => entry.id === kept.activityId && entry.version === kept.version,
        );
        total += activity?.durationMinutes ?? 0;
      } else if (!later.optional) {
        total += minimumStepMinutes(later, pool);
      }
    }
    return total;
  };

  for (const [index, definition] of recipe.steps.entries()) {
    const reserve = reserveAfter(index);
    const available = budget - planned - reserve;
    const kept = keep.get(definition.position);
    if (kept) {
      const activity = pool.find(
        (entry) => entry.id === kept.activityId && entry.version === kept.version,
      );
      if (
        !activity ||
        used.has(activity.id) ||
        !phaseCompatible(activity, definition.slot) ||
        activity.durationMinutes > available
      )
        return { ok: false, reason: "keep-ineligible", position: definition.position };
      used.add(activity.id);
      planned += activity.durationMinutes;
      steps.push({
        definition,
        activity,
        alternatives: alternativesFor(definition, pool, used, avoid, budget - planned, activity),
      });
      continue;
    }

    const chosen = pickCandidate(orderedFor(definition, pool, used, avoid, available), source);
    if (!chosen) {
      if (definition.optional) {
        skipped.push(definition.slot);
        continue;
      }
      return { ok: false, reason: "nothing-fits", position: definition.position };
    }
    used.add(chosen.id);
    planned += chosen.durationMinutes;
    steps.push({
      definition,
      activity: chosen,
      alternatives: alternativesFor(definition, pool, used, avoid, budget - planned, chosen),
    });
  }

  return {
    ok: true,
    plan: {
      recipe,
      steps,
      skipped,
      preparationMinutes: recipe.preparationMinutes,
      plannedMinutes: planned,
      budgetMinutes: budget,
    },
  };
}

function alternativesFor(
  definition: RecipeStepDefinition,
  pool: readonly Activity[],
  used: ReadonlySet<string>,
  avoid: ReadonlySet<string>,
  remaining: number,
  chosen: Activity,
): Activity[] {
  return pool
    .filter(
      (activity) =>
        activity.id !== chosen.id &&
        !used.has(activity.id) &&
        !avoid.has(activity.id) &&
        activity.durationMinutes <= Math.max(remaining, chosen.durationMinutes) &&
        activity.durationMinutes <= definition.maxMinutes &&
        phaseCompatible(activity, definition.slot),
    )
    .slice(0, 3);
}

/** Shared supplies: template ingredients plus whatever the chosen steps need. */
export function planSupplies(plan: ComposedPlan, supplies: readonly WheelSupply[]): WheelSupply[] {
  const used = new Set([
    ...plan.recipe.supplies,
    ...plan.steps.flatMap((step) => step.activity.supplies),
  ]);
  return supplies.filter((supply) => used.has(supply.id));
}

/** A template name cannot smuggle in a category the visitor has not approved. */
export function recipeOptInsSatisfied(
  recipe: RecipeDefinition,
  categories: readonly WheelCategory[],
  optIns: ReadonlySet<string>,
): boolean {
  const required = new Set(
    categories.filter((category) => category.requiredOptIn).map((category) => category.id),
  );
  return recipe.requiredOptIns.every((id) => !required.has(id) || optIns.has(id));
}
export interface ActivityDto {
  id: string;
  version: number;
  title: string;
  description: string;
  category: string;
  categoryTitle: string;
  heat: number;
  heatLabel: string;
  experimentation: number;
  energy: number;
  durationMinutes: number;
  supplies: string[];
  preparation: string[];
  accessibility: string[];
  safetyFlags: string[];
}

export interface PlanStepDto {
  position: number;
  slot: SlotKind;
  label: string;
  optional: boolean;
  guidance: string;
  minutes: number;
  activity: ActivityDto;
  alternates: { id: string; version: number; title: string; minutes: number; heat: number }[];
}

export interface PlanDto {
  planId: string;
  recipe: {
    id: string;
    version: number;
    title: string;
    subtitle: string;
    intro: string;
    closing: string;
    mood: string;
  };
  budgetMinutes: number;
  plannedMinutes: number;
  preparationMinutes: number;
  steps: PlanStepDto[];
  skipped: SlotKind[];
  supplies: WheelSupply[];
  preparation: string[];
  catalogRevision: string;
  /** Every step is a prompt for a conversation, never permission. */
  mode: "date-night-plan-not-consent";
  note: string;
}

const PLAN_NOTE =
  "A recipe is a suggestion to talk about. Every step is optional, passing is a complete answer, and either of you can stop the evening at any point.";

export function toActivityDto(
  activity: Activity,
  categories: readonly WheelCategory[],
): ActivityDto {
  return {
    id: activity.id,
    version: activity.version,
    title: activity.title,
    description: activity.description,
    category: activity.category,
    categoryTitle:
      categories.find((category) => category.id === activity.category)?.title ?? "Discovery",
    heat: activity.heat,
    heatLabel: HEAT_OPTIONS.find((option) => option.level === activity.heat)?.label ?? "Unrated",
    experimentation: activity.experimentation,
    energy: activity.energy,
    durationMinutes: activity.durationMinutes,
    supplies: [...activity.supplies],
    preparation: [...activity.preparation],
    accessibility: [...activity.accessibility],
    safetyFlags: [...activity.safetyFlags],
  };
}
export function toPlanDto(
  plan: ComposedPlan,
  categories: readonly WheelCategory[],
  supplies: readonly WheelSupply[],
  catalogRevision: string,
  planId: string,
): PlanDto {
  return {
    planId,
    recipe: {
      id: plan.recipe.id,
      version: plan.recipe.version,
      title: plan.recipe.title,
      subtitle: plan.recipe.subtitle,
      intro: plan.recipe.intro,
      closing: plan.recipe.closing,
      mood: plan.recipe.mood,
    },
    budgetMinutes: plan.budgetMinutes,
    plannedMinutes: plan.plannedMinutes,
    preparationMinutes: plan.preparationMinutes,
    steps: plan.steps.map((step) => ({
      position: step.definition.position,
      slot: step.definition.slot,
      label: SLOT_LABEL[step.definition.slot],
      optional: step.definition.optional,
      guidance: step.definition.guidance,
      minutes: step.activity.durationMinutes,
      activity: toActivityDto(step.activity, categories),
      alternates: step.alternatives.map((activity) => ({
        id: activity.id,
        version: activity.version,
        title: activity.title,
        minutes: activity.durationMinutes,
        heat: activity.heat,
      })),
    })),
    skipped: [...plan.skipped],
    supplies: planSupplies(plan, supplies),
    preparation: [...plan.recipe.preparation],
    catalogRevision,
    mode: "date-night-plan-not-consent",
    note: PLAN_NOTE,
  };
}

export interface PlanFailureDto {
  status: "empty";
  reason:
    | "no-recipe"
    | "no-eligible-step"
    | "budget-exceeded"
    | "keep-ineligible"
    | "no-eligible-ideas";
  position: number | null;
  message: string;
  hints: string[];
  catalogRevision: string;
}

export function planFailure(
  reason: PlanFailureDto["reason"],
  position: number | null,
  catalogRevision: string,
): PlanFailureDto {
  const base = { status: "empty" as const, reason, position, catalogRevision };
  if (reason === "no-eligible-ideas")
    return {
      ...base,
      message:
        "Nothing in the catalog fits those boundaries, so no plan was invented. Nothing was loosened for you.",
      hints: [
        "Loosen one ceiling deliberately if you want to: heat, experimentation, energy or time.",
        "Add a supply or a category opt-in if the evening needs one.",
      ],
    };
  if (reason === "no-recipe")
    return {
      ...base,
      message:
        "No recipe matches that combination of mood, heat, experimentation, time, supplies and opt-ins. The house is not going to pretend otherwise.",
      hints: [
        "Try a longer time budget, a gentler ceiling or a different mood.",
        "Recipes that use touch, senses, make-believe or power need that category opt-in.",
      ],
    };
  if (reason === "budget-exceeded")
    return {
      ...base,
      message: "Preparation alone is longer than the time you have. Choose a longer evening.",
      hints: ["Preparation is counted once, before the first step."],
    };
  if (reason === "keep-ineligible")
    return {
      ...base,
      message:
        "One of the steps you kept no longer fits your current rules or time budget, so nothing was replaced automatically.",
      hints: ["Reroll that step, or loosen the limit that changed."],
    };
  return {
    ...base,
    message:
      "That slot has no eligible idea left under these boundaries. The recipe stops rather than reaching past them.",
    hints: ["Reroll the step, change the time budget, or relax one ceiling deliberately."],
  };
}
export interface StepRef {
  position: number;
  activityId: string;
  version: number;
}

export type RerollResult =
  | {
      ok: true;
      position: number;
      activity: Activity;
      alternatives: Activity[];
      plannedMinutes: number;
      budgetMinutes: number;
    }
  | { ok: false; reason: "invalid-plan" | "budget" | "no-candidate" | "ineligible-choice" };

/**
 * Replaces one step, or fills an optional slot that was skipped. Every other submitted
 * step is re-validated against the *current* eligible pool, so a tampered or stale
 * plan cannot smuggle in an activity that the boundaries no longer allow.
 */
export function rerollStep(options: {
  recipe: RecipeDefinition;
  pool: readonly Activity[];
  config: EveningConfig;
  steps: readonly StepRef[];
  targetPosition: number;
  chosenActivityId?: string;
  avoid?: ReadonlySet<string>;
  source?: Uint32Source;
}): RerollResult {
  const { recipe, pool, config } = options;
  const budget = durationMinutes(config.duration);
  const definitions = new Map(recipe.steps.map((step) => [step.position, step] as const));
  const target = definitions.get(options.targetPosition);
  if (!target) return { ok: false, reason: "invalid-plan" };

  const used = new Set<string>();
  let planned = recipe.preparationMinutes;
  let targetDuration = 0;
  let sawTarget = false;
  for (const ref of options.steps) {
    const definition = definitions.get(ref.position);
    if (!definition) return { ok: false, reason: "invalid-plan" };
    const activity = pool.find(
      (entry) => entry.id === ref.activityId && entry.version === ref.version,
    );
    if (!activity || !phaseCompatible(activity, definition.slot) || used.has(activity.id))
      return { ok: false, reason: "invalid-plan" };
    used.add(activity.id);
    planned += activity.durationMinutes;
    if (ref.position === options.targetPosition) {
      sawTarget = true;
      targetDuration = activity.durationMinutes;
      used.delete(activity.id);
    }
  }
  if (!sawTarget && !target.optional && !options.chosenActivityId) {
    // Filling a required slot that a caller left out is valid only when the caller is
    // rebuilding; the server treats a missing required step as an incomplete plan.
    if (!options.steps.some((ref) => ref.position === options.targetPosition))
      return { ok: false, reason: "invalid-plan" };
  }

  const available = budget - (planned - targetDuration);
  if (available <= 0) return { ok: false, reason: "budget" };
  const candidates = stepCandidates(target, pool, used, options.avoid ?? new Set(), available);
  if (candidates.length === 0) return { ok: false, reason: "no-candidate" };

  let chosen: Activity | undefined;
  if (options.chosenActivityId) {
    chosen = candidates.find((activity) => activity.id === options.chosenActivityId);
    if (!chosen) return { ok: false, reason: "ineligible-choice" };
  } else {
    chosen = pickCandidate(candidates, options.source);
  }
  if (!chosen) return { ok: false, reason: "no-candidate" };

  const nextUsed = new Set(used);
  nextUsed.add(chosen.id);
  return {
    ok: true,
    position: target.position,
    activity: chosen,
    alternatives: alternativesFor(
      target,
      pool,
      nextUsed,
      options.avoid ?? new Set(),
      available,
      chosen,
    ),
    plannedMinutes: planned - targetDuration + chosen.durationMinutes,
    budgetMinutes: budget,
  };
}

/** Exposed for tests and the Date Night API: the exact candidate rule, in one place. */
export function stepCandidates(
  definition: RecipeStepDefinition,
  pool: readonly Activity[],
  used: ReadonlySet<string>,
  avoid: ReadonlySet<string>,
  available: number,
): Activity[] {
  return orderedFor(definition, pool, used, avoid, available);
}

export function planHints(
  recipes: readonly RecipeDefinition[],
  config: EveningConfig,
  pool: readonly Activity[],
): string[] {
  const hints: string[] = [];
  const budget = durationMinutes(config.duration);
  if (!recipes.some((recipe) => recipe.status === "published" && recipe.minimumMinutes <= budget))
    hints.push("Try a longer time budget.");
  if (config.mood !== "playful")
    hints.push("Playful recipes ask for less commitment and fewer supplies.");
  if (heatLevel(config.heat) === 0) hints.push("Medium heat opens up more than half the recipes.");
  if (experimentationLevel(config.experimentation) === 0)
    hints.push("Curious adds games and make-believe without raising heat.");
  if (pool.length === 0) hints.push("Undo a hard no, or add a category opt-in you actually want.");
  return hints.slice(0, 3);
}

/** Short, non-identifying plan handle for the interface. Not stored on the server. */
export function planId(source?: Uint32Source): string {
  const parts: string[] = [];
  for (let index = 0; index < 4; index++)
    parts.push(randomBelow(0x1_0000, source).toString(16).padStart(4, "0"));
  return parts.join("-");
}

export { eligibleActivities };
