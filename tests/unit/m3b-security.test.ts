import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DISCOVERY_ENTRIES } from "../../src/content/discovery/catalog";
import type { PlanDto } from "../../src/domain/recipes";
import { app } from "../../src/server";
import type { Bindings } from "../../src/server/bindings";
import { createTestDatabase, type TestDatabase } from "../support/d1";

let database: TestDatabase;
let env: Bindings;
const config = {
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
};
const token = "a".repeat(64);
function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(
    `/api/v1/${path}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-cheapseggs-guest": token, ...headers },
      body: JSON.stringify(body),
    },
    env,
  );
}
async function createPlan() {
  const response = await post("date-night/plans", { config, recipeId: "slow-cooker" });
  expect(response.status).toBe(200);
  const plan = (await response.json()) as PlanDto;
  expect(plan.recipe.id).toBe("slow-cooker");
  return plan;
}
function refs(plan: PlanDto) {
  return plan.steps.map((step) => ({
    position: step.position,
    activityId: step.activity.id,
    version: step.activity.version,
  }));
}
function replacement(plan: PlanDto) {
  return {
    config,
    recipeId: plan.recipe.id,
    recipeVersion: plan.recipe.version,
    steps: refs(plan),
    targetPosition: plan.steps[0]?.position,
  };
}
beforeEach(() => {
  database = createTestDatabase();
  env = {
    DB: database.db,
    APP_ENV: "local",
    SPIN_DIGEST_KEY: "test-digest-key-0123456789abcdef",
  } as Bindings;
});
afterEach(() => {
  database.raw.close();
  vi.restoreAllMocks();
});

describe("M3B independent security regressions", () => {
  it("enforces recipe opt-ins on forced keeps and step replacement", async () => {
    const plan = await createPlan();
    database.raw.exec(
      `UPDATE recipe_templates SET metadata_json = json_set(metadata_json, '$.requiredOptIns', json('["power"]')) WHERE id = 'slow-cooker'`,
    );
    const rebuilt = await post("date-night/plans", {
      config,
      recipeId: plan.recipe.id,
      keep: refs(plan),
    });
    expect(await rebuilt.json()).toMatchObject({ status: "empty", reason: "keep-ineligible" });
    const rerolled = await post("date-night/steps", replacement(plan));
    expect(rerolled.status).toBe(422);
    expect(await rerolled.json()).toEqual({ error: "invalid_plan" });
  });

  it("does not serve commercially gated recipes through the free cookbook", async () => {
    database.raw.exec(`INSERT INTO content_packs VALUES ('locked', 'locked', 'Locked', 'published');
      UPDATE recipe_templates SET pack_id = 'locked' WHERE id = 'slow-cooker'`);
    expect((await app.request("/api/v1/recipes/slow-cooker", undefined, env)).status).toBe(404);
    const list = await (await app.request("/api/v1/recipes", undefined, env)).text();
    expect(list).not.toContain('"slow-cooker"');
    const plan = await (await post("date-night/plans", { config, recipeId: "slow-cooker" })).text();
    expect(plan).not.toContain('"slow-cooker"');
  });

  it("drops recipes referencing a newly gated activity", async () => {
    const plan = await createPlan();
    database.raw.exec(
      "INSERT INTO content_packs VALUES ('locked', 'locked', 'Locked', 'published')",
    );
    database.raw
      .prepare("UPDATE activity_versions SET pack_id = ?, public_preview = 0 WHERE activity_id = ?")
      .run("locked", plan.steps[0]?.activity.id ?? "playlist");
    const response = await post("date-night/steps", replacement(plan));
    expect([404, 422]).toContain(response.status);
    const detail = await app.request("/api/v1/recipes/slow-cooker", undefined, env);
    expect(detail.status).toBe(404);
  });

  it("keeps concurrent plan replays stateless and bounds database calls", async () => {
    const prepare = vi.spyOn(database.db, "prepare");
    await createPlan();
    expect(prepare.mock.calls.length).toBeLessThanOrEqual(9);
    prepare.mockClear();
    const results = await Promise.all([createPlan(), createPlan(), createPlan()]);
    expect(results.every((plan) => plan.plannedMinutes <= plan.budgetMinutes)).toBe(true);
    expect(prepare.mock.calls.length).toBeLessThanOrEqual(21);
    expect(database.raw.prepare("SELECT * FROM guest_sessions").all()).toHaveLength(1);
    expect(database.raw.prepare("SELECT * FROM guest_spins").all()).toHaveLength(0);
  });

  it("blocks all 17 drafts across public experiences for guests and real self-declared sessions", async () => {
    let otp = "";
    env.BETTER_AUTH_SECRET = "unit-tests-only-strong-secret-32-characters";
    env.AUTH_TEST_DELIVER = async (data) => {
      otp = data.otp;
    };
    const auth = (path: string, body: unknown) =>
      app.request(
        `http://127.0.0.1:8787/api/auth/${path}`,
        {
          method: "POST",
          headers: {
            origin: "http://127.0.0.1:8787",
            "content-type": "application/json",
            "x-cheapseggs-action": "account",
          },
          body: JSON.stringify(body),
        },
        env,
      );
    expect(
      (await auth("email-otp/send-verification-otp", { email: "audit@example.com", adult: true }))
        .status,
    ).toBe(200);
    const login = await auth("sign-in/email-otp", { email: "audit@example.com", otp, adult: true });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(cookie).toContain("cheapseggs.session=");
    const drafts = DISCOVERY_ENTRIES.filter((entry) => entry.status === "draft");
    expect(drafts).toHaveLength(17);
    const publicPaths = [
      "date-night",
      "recipes",
      "wheels",
      ...["misfortune", "foreplay", "double-trouble", "dealers-choice"].map((id) => `wheels/${id}`),
    ];
    const recipeIds = database.raw
      .prepare("SELECT id FROM recipe_templates WHERE status='published'")
      .all() as { id: string }[];
    publicPaths.push(...recipeIds.map((recipe) => `recipes/${recipe.id}`));
    for (const session of ["", cookie]) {
      for (const path of publicPaths) {
        const response = await app.request(
          `/api/v1/${path}`,
          { headers: { cookie: session } },
          env,
        );
        expect(response.status).toBe(200);
        const text = await response.text();
        for (const draft of drafts) {
          expect(text).not.toContain(draft.id);
          expect(text).not.toContain(draft.title);
          expect(text).not.toContain(draft.description);
        }
      }
      const plan = await createPlan();
      for (const draft of drafts) {
        const content = await app.request(
          `/api/v1/content/${draft.id}/${draft.version}`,
          { headers: { cookie: session } },
          env,
        );
        expect(content.status).toBe(404);
        expect(await content.json()).toEqual({ error: "not_found" });
        const attempted = await post(
          "date-night/steps",
          { ...replacement(plan), chosenActivityId: draft.id },
          { cookie: session },
        );
        expect([409, 422]).toContain(attempted.status);
        const text = await attempted.text();
        expect(text).not.toContain(draft.id);
        expect(text).not.toContain(draft.title);
        const kept = await (
          await post(
            "date-night/plans",
            {
              config,
              recipeId: plan.recipe.id,
              keep: [{ position: 0, activityId: draft.id, version: draft.version }],
            },
            { cookie: session },
          )
        ).json();
        expect(kept).toMatchObject({ status: "empty", reason: "keep-ineligible" });
      }
      for (const wheelId of ["misfortune", "foreplay", "double-trouble", "dealers-choice"]) {
        const response = await post(
          "spins",
          {
            wheelId,
            idempotencyKey: crypto.randomUUID(),
            heat: "habanero",
            experimentation: "adventurous",
            duration: "all-evening",
            optIns: ["touch", "senses", "fantasy", "power"],
          },
          { cookie: session },
        );
        expect(response.status).toBe(200);
        const text = await response.text();
        for (const draft of drafts) expect(text).not.toContain(draft.id);
      }
    }
  });

  it.each(["withdrawn", "draft", "restricted", "verified_adult"])(
    "revalidates a client-held plan after %s reclassification",
    async (state) => {
      const plan = await createPlan();
      const ref = refs(plan)[0];
      if (!ref) throw new Error("missing fixture");
      const column = state === "withdrawn" || state === "draft" ? "status" : "access_tier";
      database.raw
        .prepare(`UPDATE activity_versions SET ${column} = ? WHERE activity_id = ? AND version = ?`)
        .run(state, ref.activityId, ref.version);
      const response = await post("date-night/steps", replacement(plan));
      expect([404, 422]).toContain(response.status);
      const rebuilt = await (
        await post("date-night/plans", { config, recipeId: plan.recipe.id, keep: refs(plan) })
      ).json();
      expect(rebuilt).not.toHaveProperty("steps");
    },
  );

  it("rejects duplicate and unrecognized keep positions instead of silently dropping references", async () => {
    const plan = await createPlan();
    const ref = refs(plan)[0];
    if (!ref) throw new Error("missing fixture");
    for (const keep of [[ref, ref], [{ ...ref, position: 11 }]]) {
      const result = await (
        await post("date-night/plans", { config, recipeId: plan.recipe.id, keep })
      ).json();
      expect(result).toMatchObject({ status: "empty", reason: "keep-ineligible" });
    }
    const result = await post("date-night/steps", {
      ...replacement(plan),
      steps: [ref, { ...ref, activityId: "compliments" }],
    });
    expect(result.status).toBe(422);
  });

  it("purges expired guest sessions without persisting recipe inputs or results", async () => {
    database.raw.exec("INSERT INTO guest_sessions VALUES ('expired', 1, 2)");
    const before = database.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    await createPlan();
    expect(
      database.raw.prepare("SELECT id FROM guest_sessions WHERE id='expired'").get(),
    ).toBeUndefined();
    expect(database.raw.prepare("SELECT * FROM guest_spins").all()).toHaveLength(0);
    expect(database.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual(
      before,
    );
    expect(database.raw.prepare("SELECT * FROM guest_sessions").all()).toHaveLength(1);
    expect(
      Object.keys(database.raw.prepare("SELECT * FROM guest_sessions").get() ?? {}).sort(),
    ).toEqual(["created_at", "expires_at", "id"]);
  });

  it("bounds streamed bytes, cancels oversized input, and rejects before any D1 access", async () => {
    const prepare = vi.spyOn(database.db, "prepare");
    for (const path of ["date-night/plans", "date-night/steps"]) {
      for (const length of [undefined, "1"]) {
        let cancelled = false;
        let chunks = 0;
        const body = new ReadableStream<Uint8Array>(
          {
            pull(controller) {
              chunks++;
              controller.enqueue(new TextEncoder().encode("é".repeat(3000)));
            },
            cancel() {
              cancelled = true;
            },
          },
          { highWaterMark: 0 },
        );
        const request = new Request(`http://localhost/api/v1/${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(length ? { "content-length": length } : {}),
          },
          body,
          duplex: "half",
        } as RequestInit);
        const response = await app.request(request, undefined, env);
        expect(response.status).toBe(413);
        expect(cancelled).toBe(true);
        expect(chunks).toBe(2);
      }
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  it("rejects malformed and cross-site requests and applies the limiter before D1", async () => {
    for (const path of ["date-night/plans", "date-night/steps"]) {
      expect((await post(path, {}, { origin: "https://attacker.example" })).status).toBe(403);
      expect((await post(path, {}, { "sec-fetch-site": "cross-site" })).status).toBe(403);
      expect((await post(path, {}, { "content-type": "text/plain" })).status).toBe(415);
      expect((await post(path, { config, userId: "forged", entitled: true })).status).toBe(422);
      const malformed = await app.request(
        `/api/v1/${path}`,
        { method: "POST", headers: { "content-type": "application/json" }, body: "{" },
        env,
      );
      expect(malformed.status).toBe(422);
    }
    const prepare = vi.spyOn(database.db, "prepare");
    env.SPIN_RATE_LIMITER = { limit: async () => ({ success: false }) } as RateLimit;
    for (const path of ["date-night/plans", "date-night/steps"]) {
      const response = await post(path, { config });
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("60");
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  it("revalidates paired replay after category-policy changes", async () => {
    const body = {
      wheelId: "double-trouble",
      idempotencyKey: crypto.randomUUID(),
      heat: "medium",
      experimentation: "curious",
      duration: "all-evening",
    };
    const first = await post("spins", body);
    expect(first.status).toBe(200);
    const pair = (await first.json()) as {
      result: { category: string };
      partner: { category: string };
    };
    database.raw
      .prepare("UPDATE categories SET required_opt_in = 1 WHERE id = ?")
      .run(pair.partner.category);
    const replay = await post("spins", body);
    expect(replay.status).toBe(409);
    expect(await replay.json()).toEqual({ error: "spin_invalidated" });
  });

  it("keeps replay shortlists inside submitted ceilings and exclusions", async () => {
    const body = {
      wheelId: "misfortune",
      idempotencyKey: crypto.randomUUID(),
      heat: "mild",
      excludedCategories: ["touch", "senses", "fantasy", "power", "tease"],
    };
    expect((await post("spins", body)).status).toBe(200);
    const replay = await post("spins", body);
    expect(replay.status).toBe(200);
    const data = (await replay.json()) as { shortlist: { heat: number; category: string }[] };
    for (const entry of data.shortlist) {
      expect(entry.heat).toBe(0);
      expect(body.excludedCategories).not.toContain(entry.category);
    }
  });
});
