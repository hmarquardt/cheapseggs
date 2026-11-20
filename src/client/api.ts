import type { PlanDto, PlanFailureDto, PlanStepDto } from "../domain/recipes";
import type { SpinRequest, SpinResponse, WheelConfigDto } from "../domain/wheel";
import type { RecipeDetailDto, RecipeSummaryDto } from "../services/recipe-dto";

/** Guest nonce lives in memory only: no cookie, no localStorage, no sessionStorage. */
export const GUEST_HEADER = "x-cheapseggs-guest";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export function createGuestToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function parse(response: Response): Promise<unknown> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? "request_failed", response.status);
  }
  return response.json();
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
    credentials: "omit",
    cache: "no-store",
  });
  return (await parse(response)) as T;
}

async function postJson<T>(path: string, token: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      [GUEST_HEADER]: token,
    },
    credentials: "omit",
    cache: "no-store",
    body: JSON.stringify(body),
  });
  return (await parse(response)) as T;
}

export interface WheelSummary {
  id: string;
  version: number;
  title: string;
  tagline: string;
  description: string;
  drawMode: "single" | "pair" | "category";
  shortlistSize: number;
  segmentCount: number;
}

export async function loadWheels(): Promise<WheelSummary[]> {
  const body = await getJson<{ wheels: WheelSummary[] }>("/api/v1/wheels");
  return body.wheels;
}

export async function loadWheel(wheelId: string): Promise<WheelConfigDto> {
  return getJson<WheelConfigDto>(`/api/v1/wheels/${encodeURIComponent(wheelId)}`);
}

export async function requestSpin(
  token: string,
  wheelId: string,
  body: Omit<SpinRequest, "wheelId">,
): Promise<SpinResponse> {
  return postJson<SpinResponse>("/api/v1/spins", token, { wheelId, ...body });
}

export async function resetGuest(token: string): Promise<void> {
  await fetch("/api/v1/guest", {
    method: "DELETE",
    headers: { [GUEST_HEADER]: token },
    credentials: "omit",
    cache: "no-store",
    keepalive: true,
  }).catch(() => undefined);
}

// ---------------------------------------------------------------- cookbook

export interface RecipeList {
  recipes: RecipeSummaryDto[];
  catalogRevision: string;
  disclosure: { promptNotConsent: boolean; note: string };
}

export interface RecipeDetailResponse {
  recipe: RecipeDetailDto;
  catalogRevision: string;
  disclosure: { promptNotConsent: boolean; note: string };
}

export async function loadRecipes(): Promise<RecipeList> {
  return getJson<RecipeList>("/api/v1/recipes");
}

export async function loadRecipe(id: string): Promise<RecipeDetailResponse> {
  return getJson<RecipeDetailResponse>(`/api/v1/recipes/${encodeURIComponent(id)}`);
}

// ------------------------------------------------------------- date night

export interface DateNightConfig {
  catalogRevision: string;
  categories: { id: string; title: string; blurb: string; requiredOptIn: boolean }[];
  supplies: { id: string; title: string }[];
  recipes: RecipeSummaryDto[];
  options: {
    mood: { key: string; label: string; note: string }[];
    heat: { key: string; label: string; level: number; note: string; available: boolean }[];
    experimentation: { key: string; label: string; level: number }[];
    energy: { key: string; label: string; level: number }[];
    duration: { key: string; label: string; minutes: number }[];
    environment: { key: string; label: string }[];
  };
  disclosure: { promptNotConsent: boolean; note: string };
}

export type PlanResponse = PlanDto | PlanFailureDto;

export interface StepResponse {
  catalogRevision: string;
  budgetMinutes: number;
  plannedMinutes: number;
  step: PlanStepDto;
}

export async function loadDateNight(): Promise<DateNightConfig> {
  return getJson<DateNightConfig>("/api/v1/date-night");
}

export interface PlanRequestBody {
  config: Record<string, unknown>;
  recipeId?: string;
  keep?: { position: number; activityId: string; version: number }[];
  avoid?: string[];
}

export async function requestPlan(token: string, body: PlanRequestBody): Promise<PlanResponse> {
  return postJson<PlanResponse>("/api/v1/date-night/plans", token, body);
}

export interface StepRequestBody {
  config: Record<string, unknown>;
  recipeId: string;
  recipeVersion: number;
  steps: { position: number; activityId: string; version: number }[];
  targetPosition: number;
  chosenActivityId?: string;
  avoid?: string[];
}

export async function requestStep(token: string, body: StepRequestBody): Promise<StepResponse> {
  return postJson<StepResponse>("/api/v1/date-night/steps", token, body);
}
