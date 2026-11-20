import { type Context, Hono } from "hono";
import { eligibleActivities } from "../domain/eligibility";
import {
  chooseRecipe,
  composePlan,
  type EveningConfig,
  eveningEligibility,
  planFailure,
  planHints,
  planId,
  planRequestSchema,
  recipeFits,
  rerollStep,
  SLOT_LABEL,
  stepRequestSchema,
  toActivityDto,
  toPlanDto,
} from "../domain/recipes";
import {
  DURATION_OPTIONS,
  ENERGY_OPTIONS,
  ENVIRONMENT_OPTIONS,
  EXPERIMENTATION_OPTIONS,
  GUEST_TOKEN,
  HEAT_OPTIONS,
} from "../domain/wheel";
import { toRecipeSummary } from "../services/recipe-dto";
import { loadRecipes } from "../services/recipes";
import {
  ensureGuestSession,
  type GuestSession,
  purgeExpired,
  suppliesFor,
} from "../services/wheel";
import type { Bindings } from "./bindings";
import { boundedText } from "./body";
import { recipeRevision } from "./recipes";
import { originAllowed, rateLimited, tooMany } from "./wheel";

export const dateNightRoutes = new Hono<{ Bindings: Bindings }>();

const MAX_BODY_BYTES = 8192;

const MOOD_OPTIONS = [
  { key: "romantic", label: "Romantic", note: "Slow, warm and unhurried." },
  { key: "playful", label: "Playful", note: "Silly first, sincere later." },
  { key: "adventurous", label: "Adventurous", note: "New territory with a stop word." },
] as const;

type Env = { Bindings: Bindings };

/**
 * A plan is generated on request and never stored. The guest nonce keeps abuse on an
 * expiring session, and the shared per-location limiter bounds volume; nothing about
 * the evening's configuration is written down.
 */
async function guestSession(c: Context<Env>): Promise<GuestSession | Response> {
  const presented = c.req.header("x-cheapseggs-guest");
  if (!presented || !GUEST_TOKEN.test(presented))
    return c.json({ error: "guest_session_required" }, 400);
  const now = Math.floor(Date.now() / 1000);
  const session = await ensureGuestSession(c.env.DB, presented, now);
  if (!session) return c.json({ error: "guest_session_required" }, 400);
  try {
    await purgeExpired(c.env.DB, now);
  } catch {
    // Bounded, best-effort cleanup, as on the wheel path.
  }
  return session;
}

async function readJson(c: Context<Env>): Promise<unknown | Response> {
  if (!originAllowed(c.env, c.req.header("origin"), c.req.url))
    return c.json({ error: "origin_rejected" }, 403);
  if ((c.req.header("sec-fetch-site") ?? "") === "cross-site")
    return c.json({ error: "origin_rejected" }, 403);
  const contentType = (c.req.header("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("application/json"))
    return c.json({ error: "unsupported_media_type" }, 415);
  try {
    const raw = await boundedText(c.req.raw, MAX_BODY_BYTES);
    if (raw === null) return c.json({ error: "payload_too_large" }, 413);
    return JSON.parse(raw) as unknown;
  } catch {
    return c.json({ error: "invalid_request" }, 422);
  }
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

interface LoadedCatalog {
  recipes: Awaited<ReturnType<typeof loadRecipes>>;
  revision: string;
}

async function loadCatalog(env: Bindings): Promise<LoadedCatalog> {
  const recipes = await loadRecipes(env.DB);
  return { recipes, revision: await recipeRevision(recipes) };
}

function validateIds(
  config: EveningConfig,
  categories: readonly { id: string }[],
  supplies: readonly { id: string }[],
): boolean {
  const categoryIds = new Set(categories.map((category) => category.id));
  const supplyIds = new Set(supplies.map((supply) => supply.id));
  return (
    config.optIns.every((id) => categoryIds.has(id)) &&
    config.excludedCategories.every((id) => categoryIds.has(id)) &&
    config.supplies.every((id) => supplyIds.has(id))
  );
}
dateNightRoutes.get("/date-night", async (c) => {
  if (!c.env?.DB) return c.json({ error: "unavailable" }, 503);
  if (await rateLimited(c.env, "wheel", c.req.header("cf-connecting-ip"))) return tooMany(c);
  try {
    const catalog = await loadCatalog(c.env);
    const activities = [...catalog.recipes.activities.values()];
    const supplies = suppliesFor(activities);
    const byHeat: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0 };
    for (const activity of activities) {
      byHeat[String(activity.heat)] = (byHeat[String(activity.heat)] ?? 0) + 1;
    }
    return c.json({
      catalogRevision: catalog.revision,
      categories: catalog.recipes.categories,
      supplies,
      recipes: catalog.recipes.recipes.map((recipe) =>
        toRecipeSummary(recipe, catalog.recipes.categories),
      ),
      options: {
        mood: MOOD_OPTIONS,
        heat: HEAT_OPTIONS.map((option) => ({
          key: option.key,
          label: option.label,
          level: option.level,
          note: option.note,
          available: (byHeat[String(option.level)] ?? 0) > 0,
        })),
        experimentation: EXPERIMENTATION_OPTIONS,
        energy: ENERGY_OPTIONS,
        duration: DURATION_OPTIONS,
        environment: ENVIRONMENT_OPTIONS,
      },
      disclosure: {
        promptNotConsent: true,
        note: "A plan is a prompt for a conversation. Every step is optional and either of you can stop at any time.",
      },
    });
  } catch {
    return c.json({ error: "unavailable" }, 503);
  }
});
dateNightRoutes.post("/date-night/plans", async (c) => {
  const env = c.env;
  if (!env?.DB) return c.json({ error: "unavailable" }, 503);
  if (await rateLimited(env, "spin", c.req.header("cf-connecting-ip"))) return tooMany(c);
  const body = await readJson(c);
  if (isResponse(body)) return body;
  const parsed = planRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_request" }, 422);
  try {
    const session = await guestSession(c);
    if (isResponse(session)) return session;
    const catalog = await loadCatalog(env);
    const activities = [...catalog.recipes.activities.values()];
    const supplies = suppliesFor(activities);
    if (!validateIds(parsed.data.config, catalog.recipes.categories, supplies))
      return c.json({ error: "invalid_request" }, 422);
    const pool = eligibleActivities(activities, eveningEligibility(parsed.data.config));
    if (pool.length === 0)
      return c.json(planFailure("no-eligible-ideas", null, catalog.revision), 200);
    // Re-timing/rebuilding keeps the recipe the visitor is already cooking, even when
    // the new budget sits outside its recommended band. The steps are still re-validated.
    const forced =
      parsed.data.keep.length > 0 && parsed.data.recipeId
        ? catalog.recipes.recipes.find((entry) => entry.id === parsed.data.recipeId)
        : undefined;
    const recipe =
      forced ??
      chooseRecipe(catalog.recipes.recipes, parsed.data.config, pool, parsed.data.recipeId);
    if (forced && !recipeFits(forced, parsed.data.config, pool, true).ok)
      return c.json(planFailure("keep-ineligible", null, catalog.revision), 200);
    if (!recipe) {
      const failure = planFailure("no-recipe", null, catalog.revision);
      return c.json(
        { ...failure, hints: planHints(catalog.recipes.recipes, parsed.data.config, pool) },
        200,
      );
    }
    const composed = composePlan({
      recipe,
      pool,
      config: parsed.data.config,
      keep: parsed.data.keep,
      avoid: new Set(parsed.data.avoid),
    });
    if (!composed.ok) {
      const reason =
        composed.reason === "budget-exceeded"
          ? "budget-exceeded"
          : composed.reason === "keep-ineligible"
            ? "keep-ineligible"
            : "no-eligible-step";
      return c.json(planFailure(reason, composed.position, catalog.revision), 200);
    }
    return c.json(
      toPlanDto(composed.plan, catalog.recipes.categories, supplies, catalog.revision, planId()),
      200,
    );
  } catch {
    return c.json({ error: "unavailable" }, 503);
  }
});

dateNightRoutes.post("/date-night/steps", async (c) => {
  const env = c.env;
  if (!env?.DB) return c.json({ error: "unavailable" }, 503);
  if (await rateLimited(env, "spin", c.req.header("cf-connecting-ip"))) return tooMany(c);
  const body = await readJson(c);
  if (isResponse(body)) return body;
  const parsed = stepRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_request" }, 422);
  try {
    const session = await guestSession(c);
    if (isResponse(session)) return session;
    const catalog = await loadCatalog(env);
    const activities = [...catalog.recipes.activities.values()];
    const supplies = suppliesFor(activities);
    if (!validateIds(parsed.data.config, catalog.recipes.categories, supplies))
      return c.json({ error: "invalid_request" }, 422);
    const recipe = catalog.recipes.recipes.find(
      (entry) => entry.id === parsed.data.recipeId && entry.version === parsed.data.recipeVersion,
    );
    if (!recipe) return c.json({ error: "recipe_not_found" }, 404);
    const pool = eligibleActivities(activities, eveningEligibility(parsed.data.config));
    if (!recipeFits(recipe, parsed.data.config, pool, true).ok)
      return c.json({ error: "invalid_plan" }, 422);
    const result = rerollStep({
      recipe,
      pool,
      config: parsed.data.config,
      steps: parsed.data.steps,
      targetPosition: parsed.data.targetPosition,
      ...(parsed.data.chosenActivityId ? { chosenActivityId: parsed.data.chosenActivityId } : {}),
      avoid: new Set(parsed.data.avoid),
    });
    if (!result.ok) {
      const status =
        result.reason === "invalid-plan" || result.reason === "ineligible-choice" ? 422 : 409;
      return c.json({ error: result.reason.replaceAll("-", "_") }, status);
    }
    const definition = recipe.steps.find((step) => step.position === result.position);
    if (!definition) return c.json({ error: "recipe_not_found" }, 404);
    return c.json({
      catalogRevision: catalog.revision,
      budgetMinutes: result.budgetMinutes,
      plannedMinutes: result.plannedMinutes,
      step: {
        position: result.position,
        slot: definition.slot,
        label: SLOT_LABEL[definition.slot],
        guidance: definition.guidance,
        optional: definition.optional,
        minutes: result.activity.durationMinutes,
        activity: toActivityDto(result.activity, catalog.recipes.categories),
        alternates: result.alternatives.map((activity) => ({
          id: activity.id,
          version: activity.version,
          title: activity.title,
          minutes: activity.durationMinutes,
          heat: activity.heat,
        })),
      },
    });
  } catch {
    return c.json({ error: "unavailable" }, 503);
  }
});
