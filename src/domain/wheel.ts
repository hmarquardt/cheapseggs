import { z } from "zod";
import type { Activity, EligibilityContext } from "./catalog.ts";
import { compatiblePair, eligibleActivities } from "./eligibility.ts";
import { randomBelow, selectWeighted } from "./random.ts";

/** A discovery prompt is never action approval; this marker is part of every result. */
export const DISCOVERY_PROMPT = "discovery-prompt-not-consent";

export const HEAT_OPTIONS = [
  { key: "mild", label: "Mild", level: 0, note: "Talking, noticing, warming up." },
  { key: "medium", label: "Medium", level: 1, note: "Flirtation with a wink." },
  { key: "spicy", label: "Spicy", level: 2, note: "Suggestive and still non-explicit." },
  {
    key: "habanero",
    label: "Habanero",
    level: 3,
    note: "Locked until the reviewed adult catalog and market review are complete.",
  },
] as const;

export const EXPERIMENTATION_OPTIONS = [
  { key: "classic", label: "Classic", level: 0 },
  { key: "curious", label: "Curious", level: 1 },
  { key: "adventurous", label: "Adventurous", level: 2 },
] as const;

export const ENERGY_OPTIONS = [
  { key: "low", label: "Low", level: 0 },
  { key: "moderate", label: "Moderate", level: 1 },
  { key: "high", label: "High", level: 2 },
] as const;

export const DURATION_OPTIONS = [
  { key: "quickie", label: "Quickie", minutes: 10 },
  { key: "30-minutes", label: "30 minutes", minutes: 30 },
  { key: "hour", label: "An hour", minutes: 60 },
  { key: "all-evening", label: "All evening", minutes: 240 },
] as const;

export const ENVIRONMENT_OPTIONS = [
  { key: "home", label: "Home" },
  { key: "hotel", label: "Hotel" },
  { key: "getaway", label: "Getaway" },
  { key: "private-other", label: "Somewhere else private" },
] as const;

/** Public wheel ids. Every one must also exist as a published row in D1. */
export const PUBLIC_WHEEL_IDS = [
  "misfortune",
  "foreplay",
  "double-trouble",
  "dealers-choice",
] as const;
export type PublicWheelId = (typeof PUBLIC_WHEEL_IDS)[number];

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const GUEST_TOKEN = /^[0-9a-f]{64}$/;

/**
 * Strict, bounded spin input. Defaults are the least permissive configuration:
 * mild heat, no category opt-ins, no supplies, classic range.
 */
export const spinRequestSchema = z.strictObject({
  wheelId: z.enum(PUBLIC_WHEEL_IDS).default("misfortune"),
  heat: z.enum(["mild", "medium", "spicy", "habanero"]).default("mild"),
  experimentation: z.enum(["classic", "curious", "adventurous"]).default("classic"),
  energy: z.enum(["low", "moderate", "high"]).default("moderate"),
  duration: z.enum(["quickie", "30-minutes", "hour", "all-evening"]).default("30-minutes"),
  environment: z.enum(["home", "hotel", "getaway", "private-other"]).default("home"),
  supplies: z.array(z.string().min(1).max(40)).max(12).default([]),
  optIns: z.array(z.string().min(1).max(40)).max(12).default([]),
  excludedCategories: z.array(z.string().min(1).max(40)).max(12).default([]),
  excludedActivities: z.array(z.string().min(1).max(60)).max(50).default([]),
  repeatPolicy: z.enum(["allow", "avoid-recent"]).default("avoid-recent"),
  idempotencyKey: z.string().regex(UUID_V4),
});

export type SpinRequest = z.infer<typeof spinRequestSchema>;

export interface WheelCategory {
  id: string;
  title: string;
  blurb: string;
  requiredOptIn: boolean;
}

export interface WheelSupply {
  id: string;
  title: string;
}

/** Server-loaded, server-authoritative wheel configuration. */
export interface WheelCatalog {
  wheel: {
    id: string;
    version: number;
    title: string;
    tagline: string;
    description: string;
    selectionPolicy: "uniform" | "weighted";
    drawMode: "single" | "pair" | "category";
    shortlistSize: number;
  };
  /** Published wheel segments only, with category opt-ins merged in. */
  activities: readonly Activity[];
  /** Curated per-activity weights from `wheel_segments` (used only when weighted). */
  weights: Record<string, number>;
  categories: readonly WheelCategory[];
  supplies: readonly WheelSupply[];
  revision: string;
}

function levelOf<T extends { key: string; level: number }>(
  options: readonly T[],
  key: string,
): number {
  const match = options.find((option) => option.key === key);
  if (!match) throw new RangeError("Unknown option");
  return match.level;
}

export function minutesOf(key: SpinRequest["duration"]): number {
  const match = DURATION_OPTIONS.find((option) => option.key === key);
  if (!match) throw new RangeError("Unknown duration");
  return match.minutes;
}

export function heatLabel(level: number): string {
  return HEAT_OPTIONS.find((option) => option.level === level)?.label ?? "Unknown";
}

/**
 * Maps validated input onto the shared policy context. Catalog version, opt-in
 * requirements, pack access and session history are server-derived, never supplied
 * by the browser.
 */
export function toEligibilityContext(request: SpinRequest): EligibilityContext {
  return {
    mode: "discovery",
    maxHeat: levelOf(HEAT_OPTIONS, request.heat),
    maxExperimentation: levelOf(EXPERIMENTATION_OPTIONS, request.experimentation),
    maxEnergy: levelOf(ENERGY_OPTIONS, request.energy),
    availableMinutes: minutesOf(request.duration),
    environment: request.environment,
    supplies: new Set(request.supplies),
    excludedActivities: new Set(request.excludedActivities),
    excludedCategories: new Set(request.excludedCategories),
    optIns: new Set(request.optIns),
    accessiblePackIds: new Set(),
    recentActivityIds: new Set(),
    participantApprovals: [],
    relationshipActive: false,
  };
}

/**
 * Variety filter, not a boundary filter. Repeat avoidance may fall back to the full
 * boundary-respecting pool so the wheel is not empty; it never widens heat, time,
 * environment, supplies, category opt-ins or exclusions.
 */
export function candidatePool(
  pool: readonly Activity[],
  recentActivityIds: ReadonlySet<string>,
  policy: SpinRequest["repeatPolicy"],
): readonly Activity[] {
  if (policy !== "avoid-recent" || recentActivityIds.size === 0) return pool;
  const fresh = pool.filter((activity) => !recentActivityIds.has(activity.id));
  return fresh.length > 0 ? fresh : pool;
}

export interface WeightedActivity {
  activity: Activity;
  weight: number;
}

export interface SpinPlan {
  winner: Activity;
  segments: Activity[];
  selectedIndex: number;
}

type Uint32Source = () => number;

function sampleWithoutReplacement<T>(
  items: readonly T[],
  count: number,
  source?: Uint32Source,
): T[] {
  const pool = [...items];
  const taken: T[] = [];
  const take = Math.min(count, pool.length);
  for (let index = 0; index < take; index++) {
    const offset = randomBelow(pool.length - index, source);
    const chosen = pool[index + offset] as T;
    pool[index + offset] = pool[index] as T;
    pool[index] = chosen;
    taken.push(chosen);
  }
  return taken;
}

/**
 * Authoritative selection. The winner is drawn with positive weights from the whole
 * candidate pool, then a bounded, shuffled shortlist is built around it so the wheel
 * has readable, honest wedges. The winner's position is uniform, so the animation
 * reveals a pre-computed result rather than deciding one.
 */
export function planSpin(
  pool: readonly WeightedActivity[],
  options: { shortlistSize: number; source?: Uint32Source },
): SpinPlan | null {
  if (pool.length === 0) return null;
  const winner = selectWeighted(
    pool.map((entry) => ({ value: entry.activity, weight: entry.weight })),
    options.source,
  );
  if (!winner) return null;
  return shortlistAround(
    pool.map((entry) => entry.activity),
    winner,
    options,
  );
}

/**
 * Builds a shuffled shortlist that always contains the given winner. Used both for a
 * fresh spin and for an idempotent replay, where the result must not change.
 */
export function shortlistAround(
  pool: readonly Activity[],
  winner: Activity,
  options: { shortlistSize: number; source?: Uint32Source },
): SpinPlan {
  const size = Math.min(Math.max(options.shortlistSize, 1), Math.max(pool.length, 1));
  const others = pool.filter((activity) => activity.id !== winner.id);
  const segments = sampleWithoutReplacement(
    [winner, ...sampleWithoutReplacement(others, size - 1, options.source)],
    size,
    options.source,
  );
  const selectedIndex = segments.findIndex((activity) => activity.id === winner.id);
  if (selectedIndex < 0) throw new Error("Winner missing from shortlist");
  return { winner, segments, selectedIndex };
}

/** Deterministic, order-independent digest input. Raw boundaries are never persisted. */
export function canonicalRequest(request: SpinRequest): string {
  const sorted = (values: readonly string[]) => [...values].sort();
  return JSON.stringify({
    wheelId: request.wheelId,
    heat: request.heat,
    experimentation: request.experimentation,
    energy: request.energy,
    duration: request.duration,
    environment: request.environment,
    supplies: sorted(request.supplies),
    optIns: sorted(request.optIns),
    excludedCategories: sorted(request.excludedCategories),
    excludedActivities: sorted(request.excludedActivities),
    repeatPolicy: request.repeatPolicy,
  });
}

export interface PairPlan extends SpinPlan {
  companion: Activity;
}

/**
 * Double Trouble: draw a winner, then a compatible partner that still fits the same
 * time budget. Incompatibilities, supplies and every ceiling still apply to both.
 * Returns null rather than falling back to a single idea, because "two" is the mode.
 */
export function planPairSpin(
  pool: readonly WeightedActivity[],
  availableMinutes: number,
  options: { shortlistSize: number; source?: Uint32Source },
): PairPlan | null {
  let remaining = [...pool];
  for (let attempt = 0; attempt < Math.min(remaining.length, 24); attempt++) {
    const winner = selectWeighted(
      remaining.map((entry) => ({ value: entry.activity, weight: entry.weight })),
      options.source,
    );
    if (!winner) return null;
    const companions = remaining.filter(
      (entry) =>
        compatiblePair(winner, entry.activity) &&
        winner.durationMinutes + entry.activity.durationMinutes <= availableMinutes,
    );
    if (companions.length > 0) {
      const companion = selectWeighted(
        companions.map((entry) => ({ value: entry.activity, weight: entry.weight })),
        options.source,
      );
      if (!companion) return null;
      return {
        ...shortlistAround(
          remaining.map((entry) => entry.activity),
          winner,
          options,
        ),
        companion,
      };
    }
    // No partner for this winner under these boundaries; try another winner.
    remaining = remaining.filter((entry) => entry.activity.id !== winner.id);
  }
  return null;
}

export interface DealerChoice {
  category: string;
  activities: Activity[];
}

/** Dealer's Choice: the house picks a category that is already inside the boundaries. */
export function dealerChoice(
  pool: readonly Activity[],
  source?: Uint32Source,
): DealerChoice | null {
  const categories = [...new Set(pool.map((activity) => activity.category))].sort();
  if (categories.length === 0) return null;
  const picked = categories[randomBelow(categories.length, source)] as string;
  return {
    category: picked,
    activities: pool.filter((activity) => activity.category === picked),
  };
}

export type CeilingKind = "heat" | "experimentation" | "energy" | "duration";

export interface EmptyHintChange {
  kind: CeilingKind;
  label: string;
}

export interface EmptyHint {
  /** One or two ceiling changes the visitor can choose to make. Never applied for them. */
  changes: EmptyHintChange[];
  added: number;
}

const CEILING_KINDS: readonly CeilingKind[] = ["heat", "experimentation", "energy", "duration"];

function relaxCeiling(
  context: EligibilityContext,
  kind: CeilingKind,
  value: number,
): EligibilityContext {
  if (kind === "heat") return { ...context, maxHeat: value };
  if (kind === "experimentation") return { ...context, maxExperimentation: value };
  if (kind === "energy") return { ...context, maxEnergy: value };
  return { ...context, availableMinutes: value };
}

/** Next legal step and the catalog maximum for one ceiling. */
function ceilingSteps(
  context: EligibilityContext,
  request: SpinRequest,
  kind: CeilingKind,
): { value: number; label: string }[] {
  const steps: { value: number; label: string }[] = [];
  if (kind === "heat") {
    const index = HEAT_OPTIONS.findIndex((option) => option.level === context.maxHeat);
    for (const option of HEAT_OPTIONS.slice(index + 1)) {
      steps.push({ value: option.level, label: option.label });
    }
  } else if (kind === "experimentation") {
    const index = EXPERIMENTATION_OPTIONS.findIndex(
      (option) => option.level === context.maxExperimentation,
    );
    for (const option of EXPERIMENTATION_OPTIONS.slice(index + 1)) {
      steps.push({ value: option.level, label: option.label });
    }
  } else if (kind === "energy") {
    const index = ENERGY_OPTIONS.findIndex((option) => option.level === context.maxEnergy);
    for (const option of ENERGY_OPTIONS.slice(index + 1)) {
      steps.push({ value: option.level, label: option.label });
    }
  } else {
    const index = DURATION_OPTIONS.findIndex(
      (option) => option.minutes === minutesOf(request.duration),
    );
    for (const option of DURATION_OPTIONS.slice(index + 1)) {
      steps.push({ value: option.minutes, label: option.label });
    }
  }
  const first = steps[0];
  const last = steps.at(-1);
  return first && last && last.value !== first.value ? [first, last] : steps.slice(0, 1);
}

/**
 * Neutral, user-initiated suggestions when the pool is empty. Nothing is relaxed
 * automatically, and opt-ins or exclusions are never suggested. One- and two-ceiling
 * combinations are searched because a single step is often not enough; the search is
 * bounded (4 dimensions, at most two changes, at most 33 catalog passes).
 */
export function emptyHints(activities: readonly Activity[], request: SpinRequest): EmptyHint[] {
  const context = toEligibilityContext(request);
  if (eligibleActivities(activities, context).length > 0) return [];

  const found: EmptyHint[] = [];
  const consider = (changes: EmptyHintChange[], next: EligibilityContext) => {
    const added = eligibleActivities(activities, next).length;
    if (added > 0) found.push({ changes, added });
  };

  for (const kind of CEILING_KINDS) {
    for (const step of ceilingSteps(context, request, kind)) {
      consider([{ kind, label: step.label }], relaxCeiling(context, kind, step.value));
    }
  }
  for (let a = 0; a < CEILING_KINDS.length; a++) {
    for (let b = a + 1; b < CEILING_KINDS.length; b++) {
      const first = CEILING_KINDS[a] as CeilingKind;
      const second = CEILING_KINDS[b] as CeilingKind;
      for (const firstStep of ceilingSteps(context, request, first)) {
        for (const secondStep of ceilingSteps(context, request, second)) {
          const next = relaxCeiling(
            relaxCeiling(context, first, firstStep.value),
            second,
            secondStep.value,
          );
          consider(
            [
              { kind: first, label: firstStep.label },
              { kind: second, label: secondStep.label },
            ],
            next,
          );
        }
      }
    }
  }

  const seen = new Set<string>();
  return found
    .filter((hint) => {
      const signature = hint.changes.map((change) => `${change.kind}:${change.label}`).join("+");
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .sort((left, right) => left.changes.length - right.changes.length || right.added - left.added)
    .slice(0, 3);
}

export interface SpinSegmentDto {
  index: number;
  id: string;
  title: string;
  label: string;
  category: string;
  heat: number;
}

export interface SpinResultDto {
  id: string;
  version: number;
  title: string;
  description: string;
  category: string;
  categoryTitle: string;
  tags: string[];
  heat: number;
  heatLabel: string;
  experimentation: number;
  energy: number;
  durationMinutes: number;
  environments: string[];
  supplies: string[];
  preparation: string[];
  accessibility: string[];
  safetyFlags: string[];
  phases: string[];
  /** Machine-readable reminder that a result is a prompt, never an approval. */
  mode: typeof DISCOVERY_PROMPT;
}

/** Wheel wedges need a short caption; the full title always remains in the list. */
export function shortLabel(title: string, limit = 18): string {
  if (title.length <= limit) return title;
  const clipped = title.slice(0, limit - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

export function toResultDto(
  activity: Activity,
  categories: readonly WheelCategory[],
): SpinResultDto {
  return {
    id: activity.id,
    version: activity.version,
    title: activity.title,
    description: activity.description,
    category: activity.category,
    categoryTitle:
      categories.find((category) => category.id === activity.category)?.title ?? "Discovery",
    tags: [...activity.tags],
    heat: activity.heat,
    heatLabel: heatLabel(activity.heat),
    experimentation: activity.experimentation,
    energy: activity.energy,
    durationMinutes: activity.durationMinutes,
    environments: [...activity.environments],
    supplies: [...activity.supplies],
    preparation: [...activity.preparation],
    accessibility: [...activity.accessibility],
    safetyFlags: [...activity.safetyFlags],
    phases: [...activity.phases],
    mode: DISCOVERY_PROMPT,
  };
}

export function toSegmentDtos(plan: SpinPlan): SpinSegmentDto[] {
  return plan.segments.map((activity, index) => ({
    index,
    id: activity.id,
    title: activity.title,
    label: shortLabel(activity.title),
    category: activity.category,
    heat: activity.heat,
  }));
}

export interface GuestSessionDto {
  id: string;
  expiresAt: number;
}

export interface WheelConfigDto {
  wheel: {
    id: string;
    version: number;
    title: string;
    tagline: string;
    description: string;
    shortlistSize: number;
    selectionPolicy: string;
    drawMode: string;
  };
  catalogRevision: string;
  counts: { total: number; byHeat: Record<string, number> };
  categories: WheelCategory[];
  supplies: WheelSupply[];
  options: {
    heat: { key: string; label: string; level: number; note: string; available: boolean }[];
    experimentation: { key: string; label: string; level: number }[];
    energy: { key: string; label: string; level: number }[];
    duration: { key: string; label: string; minutes: number }[];
    environment: { key: string; label: string }[];
  };
  disclosure: { promptNotConsent: true; note: string };
}

export type SpinResponse =
  | {
      status: "result";
      spinId: string;
      replayed: boolean;
      guest: GuestSessionDto;
      catalogRevision: string;
      wheel: {
        id: string;
        version: number;
        title: string;
        tagline: string;
        drawMode: string;
      };
      shortlist: SpinSegmentDto[];
      selectedIndex: number;
      eligibleCount: number;
      repeatPolicy: SpinRequest["repeatPolicy"];
      result: SpinResultDto;
      /** Double Trouble only: the compatible second idea. */
      partner: SpinResultDto | null;
      /** Dealer's Choice only: the category the house selected from the eligible pool. */
      dealerCategory: { id: string; title: string } | null;
      combinedMinutes: number | null;
    }
  | {
      status: "empty";
      guest: GuestSessionDto;
      catalogRevision: string;
      wheel: { id: string; version: number; title: string; tagline: string };
      eligibleCount: 0;
      hints: EmptyHint[];
      message: string;
    };
