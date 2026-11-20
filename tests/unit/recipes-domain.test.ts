import { describe, expect, it } from "vitest";
import {
  DISCOVERY_CATEGORIES,
  DISCOVERY_ENTRIES,
  DISCOVERY_SUPPLIES,
  DISCOVERY_WHEELS,
} from "../../src/content/discovery/catalog";
import { COOKBOOK } from "../../src/content/recipes/cookbook";
import type { Activity } from "../../src/domain/catalog";
import { eligibleActivities } from "../../src/domain/eligibility";
import {
  chooseRecipe,
  composePlan,
  durationMinutes,
  type EveningConfig,
  eveningEligibility,
  fittingRecipes,
  planSupplies,
  recipeFits,
  rerollStep,
  SLOT_PHASE,
  stepCandidates,
  toPlanDto,
} from "../../src/domain/recipes";

function publishedActivities(): Activity[] {
  return DISCOVERY_ENTRIES.filter((entry) => entry.status === "published").map((entry) => ({
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
    packId: null,
  }));
}

const POOL = publishedActivities();
const RECIPES = COOKBOOK.filter((recipe) => recipe.status === "published");
const SUPPLIES = DISCOVERY_SUPPLIES.map((supply) => ({ id: supply.id, title: supply.title }));
const CATEGORIES = DISCOVERY_CATEGORIES.map((category) => ({
  id: category.id,
  title: category.title,
  blurb: category.blurb,
  requiredOptIn: category.requiredOptIn,
}));

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function source(seed: number): () => number {
  const next = mulberry32(seed);
  return () => Math.floor(next() * 0x1_0000_0000);
}

function configFor(recipeId: string, overrides: Partial<EveningConfig> = {}): EveningConfig {
  const recipe = RECIPES.find((entry) => entry.id === recipeId);
  if (!recipe) throw new Error(`missing fixture recipe ${recipeId}`);
  return {
    mood: recipe.mood,
    heat: recipe.heatBand[0] === 2 ? "spicy" : recipe.heatBand[0] === 1 ? "medium" : "mild",
    experimentation:
      recipe.experimentationBand[0] === 2
        ? "adventurous"
        : recipe.experimentationBand[0] === 1
          ? "curious"
          : "classic",
    energy: "high",
    duration:
      recipe.maximumMinutes <= 30 ? "quickie" : recipe.minimumMinutes > 60 ? "all-evening" : "hour",
    environment: recipe.environments[0] ?? "home",
    supplies: SUPPLIES.map((supply) => supply.id),
    optIns: [...recipe.requiredOptIns],
    excludedCategories: [],
    excludedActivities: [],
    ...overrides,
  };
}

function poolFor(config: EveningConfig): Activity[] {
  return eligibleActivities(POOL, eveningEligibility(config));
}

function assertPlanInvariants(
  recipeId: string,
  config: EveningConfig,
  seed = 7,
): ReturnType<typeof composePlan> {
  const recipe = RECIPES.find((entry) => entry.id === recipeId);
  if (!recipe) throw new Error("missing recipe");
  const pool = poolFor(config);
  const result = composePlan({ recipe, pool, config, source: source(seed) });
  expect(result.ok).toBe(true);
  if (!result.ok) return result;
  const { plan } = result;
  const ids = plan.steps.map((step) => step.activity.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(plan.plannedMinutes).toBe(
    plan.preparationMinutes +
      plan.steps.reduce((total, step) => total + step.activity.durationMinutes, 0),
  );
  expect(plan.plannedMinutes).toBeLessThanOrEqual(durationMinutes(config.duration));
  const context = eveningEligibility(config);
  for (const step of plan.steps) {
    expect(pool.some((activity) => activity.id === step.activity.id)).toBe(true);
    expect(step.activity.phases).toContain(SLOT_PHASE[step.definition.slot]);
    expect(step.activity.heat).toBeLessThanOrEqual(context.maxHeat);
    for (const exclusion of config.excludedCategories)
      expect(step.activity.category).not.toBe(exclusion);
  }
  return result;
}
describe("recipe templates", () => {
  it("ships 8-12 published recipes with meaningful variety", () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(8);
    expect(RECIPES.length).toBeLessThanOrEqual(12);
    expect(new Set(RECIPES.map((recipe) => recipe.mood)).size).toBe(3);
    expect(new Set(RECIPES.map((recipe) => recipe.minimumMinutes)).size).toBeGreaterThanOrEqual(3);
    expect(RECIPES.some((recipe) => recipe.requiredOptIns.length === 0)).toBe(true);
    expect(RECIPES.some((recipe) => recipe.requiredOptIns.length > 0)).toBe(true);
  });

  it("accepts every recipe under a configuration written for it", () => {
    for (const recipe of RECIPES) {
      const config = configFor(recipe.id);
      expect(recipeFits(recipe, config, poolFor(config)), recipe.id).toEqual({ ok: true });
    }
  });

  it("refuses a recipe whose opt-in, environment or time is missing", () => {
    const chefsTable = RECIPES.find((recipe) => recipe.id === "chefs-table");
    if (!chefsTable) throw new Error("missing chefs-table");
    const base = configFor("chefs-table");
    const withoutOptIn = { ...base, optIns: [] };
    expect(recipeFits(chefsTable, withoutOptIn, poolFor(withoutOptIn)).reason).toBe("opt-in");
    const hotel = { ...base, environment: "hotel" as const };
    expect(
      recipeFits({ ...chefsTable, environments: ["home"] }, hotel, poolFor(hotel)).reason,
    ).toBe("environment");
    // Ingredients are a preference, not a boundary: the plan lists them to fetch.
    const withoutSupplies = { ...base, supplies: [] };
    expect(recipeFits(chefsTable, withoutSupplies, poolFor(withoutSupplies)).ok).toBe(true);
    const short = { ...base, duration: "quickie" as const };
    expect(recipeFits(chefsTable, short, poolFor(short)).reason).toBe("time");
  });

  it("does not offer a recipe when the eligible pool is empty", () => {
    const config: EveningConfig = {
      ...configFor("leftovers-can-be-delicious"),
      excludedCategories: CATEGORIES.map((category) => category.id),
    };
    const pool = poolFor(config);
    expect(pool).toEqual([]);
    expect(fittingRecipes(RECIPES, config, pool)).toEqual([]);
    expect(chooseRecipe(RECIPES, config, pool, "leftovers-can-be-delicious")).toBeNull();
  });
});

describe("plan composition", () => {
  it("composes an eligible, ordered, in-budget plan for every recipe", () => {
    for (const recipe of RECIPES) assertPlanInvariants(recipe.id, configFor(recipe.id));
  });

  it("splits preparation, atmosphere, warm-up, mains and finale in template order", () => {
    const result = assertPlanInvariants("slow-cooker", configFor("slow-cooker"));
    if (!result.ok) throw new Error("expected a plan");
    const slots = result.plan.steps.map((step) => step.definition.slot);
    expect(slots[0]).toBe("preparation");
    expect(slots.at(-1)).toBe("finale");
    expect(slots).toContain("atmosphere");
    expect(slots).toContain("warm-up");
    expect(slots).toContain("main");
  });

  it("never raises heat above the ceiling to fill a slot", () => {
    const config = configFor("slow-cooker", { heat: "medium", experimentation: "curious" });
    const result = assertPlanInvariants("slow-cooker", config, 11);
    if (!result.ok) throw new Error("expected a plan");
    for (const step of result.plan.steps) expect(step.activity.heat).toBeLessThanOrEqual(1);
  });

  it("keeps a quickie inside ten minutes or reports honestly", () => {
    const config: EveningConfig = { ...configFor("ten-minute-tapas"), duration: "quickie" };
    const recipe = RECIPES.find((entry) => entry.id === "ten-minute-tapas");
    if (!recipe) throw new Error("missing recipe");
    const result = composePlan({ recipe, pool: poolFor(config), config, source: source(3) });
    if (result.ok) expect(result.plan.plannedMinutes).toBeLessThanOrEqual(10);
    else expect(result.reason).toBe("nothing-fits");
  });

  it("fails rather than widening when a required slot has no eligible idea", () => {
    const recipe = RECIPES.find((entry) => entry.id === "slow-cooker");
    if (!recipe) throw new Error("missing recipe");
    const config = configFor("slow-cooker");
    const pool = poolFor(config).filter((activity) => activity.phases.includes("reconnect"));
    const result = composePlan({ recipe, pool, config, source: source(5) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("nothing-fits");
  });
});

describe("keeps, supplies and DTOs", () => {
  it("keeps chosen steps when the time budget grows, and refuses an impossible keep", () => {
    const config = configFor("slow-cooker");
    const first = assertPlanInvariants("slow-cooker", config);
    if (!first.ok) throw new Error("expected a plan");
    const keep = first.plan.steps.map((step) => ({
      position: step.definition.position,
      activityId: step.activity.id,
      version: step.activity.version,
    }));
    const extended = { ...config, duration: "all-evening" as const };
    const kept = composePlan({
      recipe: first.plan.recipe,
      pool: poolFor(extended),
      config: extended,
      keep,
      source: source(9),
    });
    expect(kept.ok).toBe(true);
    if (!kept.ok) return;
    const keptIds = kept.plan.steps.map((step) => step.activity.id);
    for (const step of keep) expect(keptIds).toContain(step.activityId);

    const shortened = { ...config, duration: "quickie" as const };
    const impossible = composePlan({
      recipe: first.plan.recipe,
      pool: poolFor(shortened),
      config: shortened,
      keep,
      source: source(9),
    });
    expect(impossible.ok).toBe(false);
    if (!impossible.ok) expect(impossible.reason).toBe("keep-ineligible");
  });

  it("collects template and step supplies once, with labels", () => {
    const result = assertPlanInvariants("breakfast-in-bed", configFor("breakfast-in-bed"));
    if (!result.ok) throw new Error("expected a plan");
    const supplies = planSupplies(result.plan, SUPPLIES);
    expect(supplies.length).toBe(new Set(supplies.map((supply) => supply.id)).size);
    expect(supplies.every((supply) => supply.title.length > 0)).toBe(true);
  });

  it("produces a DTO that carries the prompt-not-consent marker and no private data", () => {
    const config = configFor("slow-cooker");
    const result = assertPlanInvariants("slow-cooker", config);
    if (!result.ok) throw new Error("expected a plan");
    const dto = toPlanDto(result.plan, CATEGORIES, SUPPLIES, "test-revision", "plan-1");
    expect(dto.mode).toBe("date-night-plan-not-consent");
    expect(dto.note).toContain("optional");
    expect(JSON.stringify(dto)).not.toMatch(/user|session|couple|consentEpoch/i);
  });
});

describe("step rerolls and replacements", () => {
  // Curious (experimentation 1) keeps the template's own mains eligible, so the reroll
  // tests measure candidate policy rather than an unrelated ceiling.
  const config = configFor("slow-cooker", { heat: "medium", experimentation: "curious" });
  const recipe = RECIPES.find((entry) => entry.id === "slow-cooker");
  if (!recipe) throw new Error("fixture");

  function plan() {
    const result = assertPlanInvariants("slow-cooker", config);
    if (!result.ok) throw new Error("expected a plan");
    return result.plan;
  }

  function stepRefs(current: ReturnType<typeof plan>) {
    return current.steps.map((step) => ({
      position: step.definition.position,
      activityId: step.activity.id,
      version: step.activity.version,
    }));
  }

  it("rerolls a single step within the same phase and budget", () => {
    const current = plan();
    const target = current.steps.find((step) => step.definition.slot === "main");
    if (!target) throw new Error("missing main step");
    const result = rerollStep({
      recipe,
      pool: poolFor(config),
      config,
      steps: stepRefs(current),
      targetPosition: target.definition.position,
      avoid: new Set([target.activity.id]),
      source: source(21),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.activity.id).not.toBe(target.activity.id);
    expect(result.activity.phases).toContain(SLOT_PHASE[target.definition.slot]);
    expect(result.plannedMinutes).toBeLessThanOrEqual(result.budgetMinutes);
  });

  it("only accepts a replacement from the eligible candidate list", () => {
    const current = plan();
    const target = current.steps.find((step) => step.definition.slot === "warm-up");
    if (!target) throw new Error("missing warm-up");
    const steps = stepRefs(current);
    const pool = poolFor(config);
    const used = new Set(
      steps
        .filter((step) => step.position !== target.definition.position)
        .map((step) => step.activityId),
    );
    const candidates = stepCandidates(
      target.definition,
      pool,
      used,
      new Set(),
      durationMinutes(config.duration) - current.preparationMinutes,
    );
    const forbidden = POOL.find(
      (activity) =>
        activity.category === "touch" &&
        !activity.phases.includes(SLOT_PHASE[target.definition.slot]),
    );
    const rejected = rerollStep({
      recipe,
      pool,
      config,
      steps,
      targetPosition: target.definition.position,
      chosenActivityId: forbidden?.id ?? "not-a-real-activity",
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.reason).toBe("ineligible-choice");

    const chosen = candidates[0];
    if (chosen) {
      const replacement = rerollStep({
        recipe,
        pool,
        config,
        steps,
        targetPosition: target.definition.position,
        chosenActivityId: chosen.id,
      });
      expect(replacement.ok).toBe(true);
      if (replacement.ok) expect(replacement.activity.id).toBe(chosen.id);
    }
  });

  it("rejects a tampered plan instead of trusting client state", () => {
    const current = plan();
    const steps = stepRefs(current).map((step, index) =>
      index === 0 ? { ...step, activityId: "draft-silk-and-ice", version: 1 } : step,
    );
    const result = rerollStep({
      recipe,
      pool: poolFor(config),
      config,
      steps,
      targetPosition: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid-plan");
  });

  it("refuses a replacement that would exceed the time budget", () => {
    const current = plan();
    const tight: EveningConfig = { ...config, duration: "hour" };
    const result = rerollStep({
      recipe,
      pool: poolFor(tight),
      config: tight,
      steps: stepRefs(current),
      targetPosition: 3,
      chosenActivityId: "the-honest-answer",
    });
    expect(result.ok).toBe(false);
  });
});

describe("wheel mode selectors", () => {
  it("keeps every public wheel segment inside the reviewed manifest", () => {
    const published = new Set(
      DISCOVERY_ENTRIES.filter((entry) => entry.status === "published").map((entry) => entry.id),
    );
    for (const wheel of DISCOVERY_WHEELS) {
      expect(wheel.segmentIds.length).toBeGreaterThanOrEqual(wheel.shortlistSize);
      for (const id of wheel.segmentIds) expect(published.has(id)).toBe(true);
    }
    expect(DISCOVERY_WHEELS.map((wheel) => wheel.drawMode).sort()).toEqual([
      "category",
      "pair",
      "single",
      "single",
    ]);
  });
});
