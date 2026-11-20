import type { SpinRequest } from "../../domain/wheel";

export type HeatKey = "mild" | "medium" | "spicy" | "habanero";
export type ExperimentationKey = "classic" | "curious" | "adventurous";
export type EnergyKey = "low" | "moderate" | "high";
export type DurationKey = "quickie" | "30-minutes" | "hour" | "all-evening";
export type EnvironmentKey = "home" | "hotel" | "getaway" | "private-other";

export interface Settings {
  heat: HeatKey;
  experimentation: ExperimentationKey;
  energy: EnergyKey;
  duration: DurationKey;
  environment: EnvironmentKey;
  supplies: string[];
  optIns: string[];
  excludedCategories: string[];
  excludedActivities: string[];
  avoidRepeats: boolean;
  sound: boolean;
}

/** Least permissive starting point: mild, classic, nothing opted in, no sound. */
export const DEFAULT_SETTINGS: Settings = {
  heat: "mild",
  experimentation: "classic",
  energy: "moderate",
  duration: "30-minutes",
  environment: "home",
  supplies: [],
  optIns: [],
  excludedCategories: [],
  excludedActivities: [],
  avoidRepeats: true,
  sound: false,
};

export type SpinBody = Omit<SpinRequest, "wheelId">;

export function toSpinBody(settings: Settings, idempotencyKey: string): SpinBody {
  return {
    heat: settings.heat,
    experimentation: settings.experimentation,
    energy: settings.energy,
    duration: settings.duration,
    environment: settings.environment,
    supplies: settings.supplies,
    optIns: settings.optIns,
    excludedCategories: settings.excludedCategories,
    excludedActivities: settings.excludedActivities,
    repeatPolicy: settings.avoidRepeats ? "avoid-recent" : "allow",
    idempotencyKey,
  };
}

export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}
