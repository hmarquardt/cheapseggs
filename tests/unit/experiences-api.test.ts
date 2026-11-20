import { describe, expect, it } from "vitest";
import { COOKBOOK } from "../../src/content/recipes/cookbook";
import { app } from "../../src/server";
import type { Bindings } from "../../src/server/bindings";
import { createTestDatabase, type TestDatabase } from "../support/d1";

const TEST_DIGEST_KEY = "test-digest-key-0123456789abcdef";

function env(db: D1Database): Bindings {
  return { DB: db, APP_ENV: "local", SPIN_DIGEST_KEY: TEST_DIGEST_KEY } as unknown as Bindings;
}

function guestToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface PlanBody {
  config: Record<string, unknown>;
  recipeId?: string;
  keep?: { position: number; activityId: string; version: number }[];
  avoid?: string[];
}

function baseConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mood: "romantic",
    heat: "medium",
    experimentation: "curious",
    energy: "high",
    duration: "all-evening",
    environment: "home",
    supplies: [],
    optIns: [],
    excludedCategories: [],
    excludedActivities: [],
    ...overrides,
  };
}

async function post(
  database: TestDatabase,
  path: string,
  body: Record<string, unknown>,
  token = guestToken(),
): Promise<Response> {
  return app.request(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-cheapseggs-guest": token },
      body: JSON.stringify(body),
    },
    env(database.db),
  );
}

const plan = (database: TestDatabase, body: PlanBody, token?: string) =>
  post(database, "/api/v1/date-night/plans", { ...body }, token);
const step = (database: TestDatabase, body: Record<string, unknown>, token?: string) =>
  post(database, "/api/v1/date-night/steps", body, token);
const spin = (database: TestDatabase, body: Record<string, unknown>, token: string) =>
  post(database, "/api/v1/spins", body, token);

const RESTRICTED_MARKERS = ["draft-", "blindfold hour", "restraint protocol", "brat hour"];

describe("wheel modes", () => {
  it("publishes the four public wheels without drafts or restricted content", async () => {
    const database = createTestDatabase();
    const response = await app.request("/api/v1/wheels", undefined, env(database.db));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      wheels: { id: string; drawMode: string; segmentCount: number; title: string }[];
    };
    expect(body.wheels.map((wheel) => wheel.id)).toEqual([
      "misfortune",
      "foreplay",
      "double-trouble",
      "dealers-choice",
    ]);
    expect(body.wheels.every((wheel) => wheel.segmentCount > 0)).toBe(true);
    expect(JSON.stringify(body)).not.toContain("chemistry-preview");
    for (const marker of RESTRICTED_MARKERS) expect(JSON.stringify(body)).not.toContain(marker);
  });

  it("serves the foreplay wheel with its own narrower segment set", async () => {
    const database = createTestDatabase();
    const foreplay = (await (
      await app.request("/api/v1/wheels/foreplay", undefined, env(database.db))
    ).json()) as {
      counts: { total: number; byHeat: Record<string, number> };
      wheel: { drawMode: string };
    };
    const misfortune = (await (
      await app.request("/api/v1/wheels/misfortune", undefined, env(database.db))
    ).json()) as { counts: { total: number } };
    expect(foreplay.counts.total).toBeGreaterThan(8);
    expect(foreplay.counts.total).toBeLessThan(misfortune.counts.total);
    expect(foreplay.counts.byHeat["2"]).toBe(0);
    expect(foreplay.wheel.drawMode).toBe("single");
  });

  it("deals a compatible pair for Double Trouble and replays the same pair", async () => {
    const database = createTestDatabase();
    const token = guestToken();
    const key = crypto.randomUUID();
    const body = {
      wheelId: "double-trouble",
      idempotencyKey: key,
      heat: "medium",
      experimentation: "curious",
      duration: "all-evening",
    };
    const response = await spin(database, body, token);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      status: string;
      result: { id: string; durationMinutes: number; heat: number };
      partner: { id: string; durationMinutes: number; heat: number } | null;
      combinedMinutes: number | null;
      wheel: { drawMode: string };
    };
    expect(payload.status).toBe("result");
    expect(payload.wheel.drawMode).toBe("pair");
    expect(payload.partner).not.toBeNull();
    expect(payload.partner?.id).not.toBe(payload.result.id);
    expect(payload.result.heat).toBeLessThanOrEqual(1);
    expect(payload.partner?.heat).toBeLessThanOrEqual(1);
    expect(payload.combinedMinutes).toBe(
      payload.result.durationMinutes + (payload.partner?.durationMinutes ?? 0),
    );
    expect(payload.combinedMinutes).toBeLessThanOrEqual(240);

    const replayed = (await (await spin(database, body, token)).json()) as {
      replayed: boolean;
      result: { id: string };
      partner: { id: string } | null;
    };
    expect(replayed.replayed).toBe(true);
    expect(replayed.result.id).toBe(payload.result.id);
    expect(replayed.partner?.id).toBe(payload.partner?.id);
  });

  it("lets the house pick a category that is already inside the boundaries", async () => {
    const database = createTestDatabase();
    const response = await spin(
      database,
      { wheelId: "dealers-choice", idempotencyKey: crypto.randomUUID(), heat: "medium" },
      guestToken(),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      status: string;
      result: { category: string; heat: number };
      dealerCategory: { id: string; title: string } | null;
      wheel: { drawMode: string };
    };
    expect(payload.status).toBe("result");
    expect(payload.wheel.drawMode).toBe("category");
    expect(payload.dealerCategory?.id).toBe(payload.result.category);
    expect(payload.dealerCategory?.title.length).toBeGreaterThan(0);
    expect(payload.result.heat).toBeLessThanOrEqual(1);
  });

  it("rejects an unknown wheel id instead of falling back", async () => {
    const database = createTestDatabase();
    const response = await spin(
      database,
      { wheelId: "chemistry-preview", idempotencyKey: crypto.randomUUID() },
      guestToken(),
    );
    expect(response.status).toBe(422);
  });
});

describe("Romance Cookbook", () => {
  it("lists the published cookbook without drafts or restricted recipes", async () => {
    const database = createTestDatabase();
    const response = await app.request("/api/v1/recipes", undefined, env(database.db));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      recipes: { id: string; title: string; stepCount: number; supplies: { title: string }[] }[];
      catalogRevision: string;
    };
    const expected = COOKBOOK.filter((recipe) => recipe.status === "published");
    expect(body.recipes.map((recipe) => recipe.id).sort()).toEqual(
      expected.map((recipe) => recipe.id).sort(),
    );
    expect(body.recipes.every((recipe) => recipe.stepCount >= 3)).toBe(true);
    expect(body.catalogRevision).toMatch(/^cookbook\+[0-9a-f]{16}$/);
    for (const marker of RESTRICTED_MARKERS) expect(JSON.stringify(body)).not.toContain(marker);
  });

  it("serves a full recipe with public activities and substitutions", async () => {
    const database = createTestDatabase();
    const response = await app.request("/api/v1/recipes/slow-cooker", undefined, env(database.db));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      recipe: {
        id: string;
        intro: string;
        preparation: string[];
        steps: {
          slot: string;
          guidance: string;
          activity: { id: string; heat: number; description: string };
          substitutions: { id: string }[];
        }[];
      };
    };
    expect(body.recipe.id).toBe("slow-cooker");
    expect(body.recipe.intro.length).toBeGreaterThan(60);
    expect(body.recipe.preparation.length).toBeGreaterThan(0);
    expect(body.recipe.steps.length).toBeGreaterThanOrEqual(3);
    for (const recipeStep of body.recipe.steps) {
      expect(recipeStep.guidance.length).toBeGreaterThan(20);
      expect(recipeStep.activity.heat).toBeLessThanOrEqual(2);
      for (const substitution of recipeStep.substitutions)
        expect(substitution.id).not.toContain("draft");
    }
  });

  it("returns 404 for an unknown or restricted recipe", async () => {
    const database = createTestDatabase();
    for (const id of ["draft-silk-and-ice", "not-a-recipe"]) {
      const response = await app.request(`/api/v1/recipes/${id}`, undefined, env(database.db));
      expect(response.status).toBe(404);
    }
  });
});

describe("Date Night Machine API", () => {
  it("publishes config and recipe summaries for the interface", async () => {
    const database = createTestDatabase();
    const response = await app.request("/api/v1/date-night", undefined, env(database.db));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      recipes: { id: string }[];
      options: {
        mood: { key: string }[];
        heat: { key: string; available: boolean }[];
        duration: { key: string }[];
      };
      disclosure: { promptNotConsent: boolean };
    };
    expect(body.recipes).toHaveLength(COOKBOOK.filter((r) => r.status === "published").length);
    expect(body.options.mood.map((mood) => mood.key)).toEqual([
      "romantic",
      "playful",
      "adventurous",
    ]);
    expect(body.options.heat.find((option) => option.key === "habanero")?.available).toBe(false);
    expect(body.options.duration.map((option) => option.key)).toEqual([
      "quickie",
      "30-minutes",
      "hour",
      "all-evening",
    ]);
    expect(body.disclosure.promptNotConsent).toBe(true);
  });

  it("requires a guest nonce before generating a plan", async () => {
    const database = createTestDatabase();
    const response = await app.request(
      "/api/v1/date-night/plans",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: baseConfig() }),
      },
      env(database.db),
    );
    expect(response.status).toBe(400);
  });

  it("composes a personalized, in-budget plan that respects the ceilings", async () => {
    const database = createTestDatabase();
    const response = await plan(database, { config: baseConfig() });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      planId: string;
      recipe: { id: string; title: string; intro: string };
      budgetMinutes: number;
      plannedMinutes: number;
      steps: {
        position: number;
        slot: string;
        activity: { id: string; version: number; heat: number; category: string; title: string };
        alternates: { id: string }[];
        minutes: number;
      }[];
      supplies: { id: string; title: string }[];
      preparation: string[];
      mode: string;
    };
    expect(body.mode).toBe("date-night-plan-not-consent");
    expect(body.steps.length).toBeGreaterThanOrEqual(3);
    expect(body.plannedMinutes).toBeLessThanOrEqual(body.budgetMinutes);
    expect(body.steps[0]?.slot).toBe("preparation");
    expect(body.steps.at(-1)?.slot).toBe("finale");
    const ids = body.steps.map((step) => step.activity.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const planStep of body.steps) expect(planStep.activity.heat).toBeLessThanOrEqual(1);
    for (const marker of RESTRICTED_MARKERS) expect(JSON.stringify(body)).not.toContain(marker);
    expect(JSON.stringify(body)).not.toMatch(/session|guest|userId/i);
  });

  it("reports an empty evening instead of relaxing a hard no", async () => {
    const database = createTestDatabase();
    const response = await plan(database, {
      config: baseConfig({
        excludedCategories: [
          "connection",
          "tease",
          "playful",
          "atmosphere",
          "movement",
          "touch",
          "senses",
          "fantasy",
          "power",
          "reconnect",
        ],
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; reason: string; hints: string[] };
    expect(body.status).toBe("empty");
    expect(body.reason).toBe("no-eligible-ideas");
    expect(body.hints.length).toBeGreaterThan(0);
  });

  it("does not hand out a recipe whose opt-in the visitor has not given", async () => {
    const database = createTestDatabase();
    const body = (await (
      await plan(database, { config: baseConfig(), recipeId: "chefs-table" })
    ).json()) as { recipe?: { id: string }; status?: string };
    if (body.recipe) expect(body.recipe.id).not.toBe("chefs-table");
    else expect(body.status).toBe("empty");
  });

  it("rejects unknown categories and supplies rather than ignoring them", async () => {
    const database = createTestDatabase();
    for (const config of [
      baseConfig({ optIns: ["not-a-category"] }),
      baseConfig({ supplies: ["not-a-supply"] }),
      baseConfig({ excludedCategories: ["not-a-category"] }),
    ]) {
      expect((await plan(database, { config })).status).toBe(422);
    }
  });
});

describe("Date Night step replacement", () => {
  it("rerolls one step within the plan and refuses a tampered step", async () => {
    const database = createTestDatabase();
    const created = (await (await plan(database, { config: baseConfig() })).json()) as {
      recipe: { id: string; version: number };
      steps: { position: number; slot: string; activity: { id: string; version: number } }[];
      plannedMinutes: number;
      budgetMinutes: number;
    };
    const steps = created.steps.map((planStep) => ({
      position: planStep.position,
      activityId: planStep.activity.id,
      version: planStep.activity.version,
    }));
    const target = created.steps.find((planStep) => planStep.slot === "main");
    expect(target).toBeTruthy();
    if (!target) return;
    const body = {
      config: baseConfig(),
      recipeId: created.recipe.id,
      recipeVersion: created.recipe.version,
      steps,
      targetPosition: target.position,
    };
    const token = guestToken();
    const rerolled = await step(database, body, token);
    expect(rerolled.status).toBe(200);
    const payload = (await rerolled.json()) as {
      step: { position: number; activity: { id: string; heat: number }; alternates: unknown[] };
      plannedMinutes: number;
      budgetMinutes: number;
    };
    expect(payload.step.position).toBe(target.position);
    expect(payload.step.activity.heat).toBeLessThanOrEqual(1);
    expect(payload.plannedMinutes).toBeLessThanOrEqual(payload.budgetMinutes);

    const tampered = await step(
      database,
      {
        ...body,
        steps: steps.map((entry, index) =>
          index === 0 ? { ...entry, activityId: "draft-silk-and-ice", version: 1 } : entry,
        ),
      },
      token,
    );
    expect(tampered.status).toBe(422);
    expect(((await tampered.json()) as { error: string }).error).toBe("invalid_plan");

    const nonsenseChoice = await step(
      database,
      { ...body, chosenActivityId: "draft-silk-and-ice" },
      token,
    );
    expect([409, 422]).toContain(nonsenseChoice.status);
  });

  it("never returns restricted adult material through any experience route", async () => {
    const database = createTestDatabase();
    const bodies: string[] = [];
    for (const path of ["/api/v1/recipes", "/api/v1/date-night", "/api/v1/wheels"]) {
      bodies.push(await (await app.request(path, undefined, env(database.db))).text());
    }
    bodies.push(await (await plan(database, { config: baseConfig() })).text());
    for (const body of bodies) {
      for (const marker of RESTRICTED_MARKERS) expect(body).not.toContain(marker);
    }
  });
});
