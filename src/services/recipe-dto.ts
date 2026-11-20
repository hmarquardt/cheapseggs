import { DISCOVERY_SUPPLIES } from "../content/discovery/catalog";
import type { Activity } from "../domain/catalog";
import {
  type RecipeDefinition,
  type RecipeStepDefinition,
  SLOT_LABEL,
  toActivityDto,
} from "../domain/recipes";
import type { WheelCategory } from "../domain/wheel";

/** Presentation-only mapping. No identity, entitlement or private state is involved. */
export interface RecipeSummaryDto {
  id: string;
  version: number;
  title: string;
  subtitle: string;
  intro: string;
  mood: string;
  heatRange: { min: number; max: number };
  experimentationRange: { min: number; max: number };
  duration: { minimumMinutes: number; maximumMinutes: number; preparationMinutes: number };
  supplies: { id: string; title: string }[];
  stepCount: number;
  closing: string;
  optIns: string[];
  environments: string[];
}

export interface RecipeDetailDto extends RecipeSummaryDto {
  preparation: string[];
  steps: {
    position: number;
    slot: string;
    label: string;
    guidance: string;
    optional: boolean;
    activity: ReturnType<typeof toActivityDto>;
    substitutions: { id: string; version: number; title: string; minutes: number; heat: number }[];
  }[];
}

export function supplyLabels(ids: readonly string[]): { id: string; title: string }[] {
  return ids.map((id) => ({
    id,
    title: DISCOVERY_SUPPLIES.find((supply) => supply.id === id)?.title ?? id,
  }));
}

function categoryTitles(ids: readonly string[], categories: readonly WheelCategory[]): string[] {
  return ids.map((id) => categories.find((category) => category.id === id)?.title ?? id);
}

export function toRecipeSummary(
  recipe: RecipeDefinition,
  categories: readonly WheelCategory[],
): RecipeSummaryDto {
  return {
    id: recipe.id,
    version: recipe.version,
    title: recipe.title,
    subtitle: recipe.subtitle,
    intro: recipe.intro,
    mood: recipe.mood,
    heatRange: { min: recipe.heatBand[0], max: recipe.heatBand[1] },
    experimentationRange: {
      min: recipe.experimentationBand[0],
      max: recipe.experimentationBand[1],
    },
    duration: {
      minimumMinutes: recipe.minimumMinutes,
      maximumMinutes: recipe.maximumMinutes,
      preparationMinutes: recipe.preparationMinutes,
    },
    supplies: supplyLabels(recipe.supplies),
    stepCount: recipe.steps.length,
    closing: recipe.closing,
    optIns: categoryTitles(recipe.requiredOptIns, categories),
    environments: [...recipe.environments],
  };
}

function substitution(
  definition: RecipeStepDefinition,
  activities: ReadonlyMap<string, Activity>,
): RecipeDetailDto["steps"][number]["substitutions"] {
  return definition.alternatives
    .map(([id, version]) => activities.get(`${id}@${version}`))
    .filter((activity): activity is Activity => Boolean(activity))
    .map((activity) => ({
      id: activity.id,
      version: activity.version,
      title: activity.title,
      minutes: activity.durationMinutes,
      heat: activity.heat,
    }));
}

export function toRecipeDetail(
  recipe: RecipeDefinition,
  activities: ReadonlyMap<string, Activity>,
  categories: readonly WheelCategory[],
): RecipeDetailDto | null {
  const steps: RecipeDetailDto["steps"] = [];
  for (const definition of recipe.steps) {
    const primary = activities.get(`${definition.primary[0]}@${definition.primary[1]}`);
    if (!primary) return null;
    steps.push({
      position: definition.position,
      slot: definition.slot,
      label: SLOT_LABEL[definition.slot],
      guidance: definition.guidance,
      optional: definition.optional,
      activity: toActivityDto(primary, categories),
      substitutions: substitution(definition, activities),
    });
  }
  return {
    ...toRecipeSummary(recipe, categories),
    preparation: [...recipe.preparation],
    steps,
  };
}
