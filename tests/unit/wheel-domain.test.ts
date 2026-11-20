import { describe, expect, it } from "vitest";
import type { Activity } from "../../src/domain/catalog";
import {
  candidatePool,
  canonicalRequest,
  planSpin,
  shortLabel,
  shortlistAround,
  spinRequestSchema,
  toEligibilityContext,
} from "../../src/domain/wheel";

function activity(id: string, overrides: Partial<Activity> = {}): Activity {
  return {
    id,
    version: 1,
    title: `Idea ${id}`,
    description: "Fixture entry for selection tests.",
    category: "connection",
    tags: [],
    heat: 0,
    experimentation: 0,
    energy: 0,
    durationMinutes: 10,
    environments: ["home"],
    supplies: [],
    preparation: [],
    accessibility: [],
    safetyFlags: [],
    requiredOptIns: [],
    incompatibleWith: [],
    phases: ["warm-up"],
    status: "published",
    packId: null,
    ...overrides,
  };
}

/** Deterministic PRNG so statistical assertions are stable in CI. */
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

const KEY = "11111111-2222-4333-8444-555555555555";

describe("spin request contract", () => {
  it("defaults to the least permissive configuration", () => {
    const request = spinRequestSchema.parse({ idempotencyKey: KEY });
    expect(request).toMatchObject({
      wheelId: "misfortune",
      heat: "mild",
      experimentation: "classic",
      energy: "moderate",
      duration: "30-minutes",
      environment: "home",
      supplies: [],
      optIns: [],
      excludedCategories: [],
      excludedActivities: [],
      repeatPolicy: "avoid-recent",
    });
    const context = toEligibilityContext(request);
    expect(context).toMatchObject({
      mode: "discovery",
      maxHeat: 0,
      maxExperimentation: 0,
      availableMinutes: 30,
      environment: "home",
    });
    expect(context.optIns.size).toBe(0);
    expect(context.relationshipActive).toBe(false);
    expect(context.participantApprovals).toEqual([]);
  });

  it("rejects unknown fields, bad keys and oversized lists", () => {
    expect(spinRequestSchema.safeParse({ idempotencyKey: KEY, extra: 1 }).success).toBe(false);
    expect(spinRequestSchema.safeParse({ idempotencyKey: "nope" }).success).toBe(false);
    expect(
      spinRequestSchema.safeParse({
        idempotencyKey: KEY,
        supplies: Array.from({ length: 13 }, (_, index) => `s${index}`),
      }).success,
    ).toBe(false);
  });

  it("maps every ceiling onto the shared policy context", () => {
    const context = toEligibilityContext(
      spinRequestSchema.parse({
        idempotencyKey: KEY,
        heat: "spicy",
        experimentation: "adventurous",
        energy: "high",
        duration: "all-evening",
        environment: "hotel",
        supplies: ["timer"],
        optIns: ["touch"],
        excludedCategories: ["fantasy"],
        excludedActivities: ["compliments"],
      }),
    );
    expect(context.maxHeat).toBe(2);
    expect(context.maxExperimentation).toBe(2);
    expect(context.maxEnergy).toBe(2);
    expect(context.availableMinutes).toBe(240);
    expect(context.environment).toBe("hotel");
    expect([...context.supplies]).toEqual(["timer"]);
    expect([...context.optIns]).toEqual(["touch"]);
    expect([...context.excludedCategories]).toEqual(["fantasy"]);
    expect([...context.excludedActivities]).toEqual(["compliments"]);
  });

  it("builds a stable, order-independent digest input", () => {
    const a = spinRequestSchema.parse({
      idempotencyKey: KEY,
      supplies: ["b", "a"],
      optIns: ["touch", "fantasy"],
    });
    const b = spinRequestSchema.parse({
      idempotencyKey: "11111111-2222-4333-8444-666666666666",
      supplies: ["a", "b"],
      optIns: ["fantasy", "touch"],
    });
    expect(canonicalRequest(a)).toBe(canonicalRequest(b));
    expect(canonicalRequest(a)).not.toContain(KEY);
    const hotter = spinRequestSchema.parse({ idempotencyKey: KEY, heat: "spicy" });
    expect(canonicalRequest(hotter)).not.toBe(
      canonicalRequest(spinRequestSchema.parse({ idempotencyKey: KEY })),
    );
  });

  describe("variety without widening boundaries", () => {
    const pool = [activity("a"), activity("b"), activity("c")];

    it("drops recently seen results when alternatives exist", () => {
      expect(
        candidatePool(pool, new Set(["a", "b"]), "avoid-recent").map((entry) => entry.id),
      ).toEqual(["c"]);
    });

    it("falls back to the same eligible pool instead of returning nothing", () => {
      expect(
        candidatePool(pool, new Set(["a", "b", "c"]), "avoid-recent").map((entry) => entry.id),
      ).toEqual(["a", "b", "c"]);
    });

    it("ignores history when the visitor allows repeats", () => {
      expect(candidatePool(pool, new Set(["a"]), "allow").map((entry) => entry.id)).toEqual([
        "a",
        "b",
        "c",
      ]);
    });
  });

  describe("authoritative selection", () => {
    it("returns nothing for an empty pool rather than inventing a result", () => {
      expect(planSpin([], { shortlistSize: 8 })).toBeNull();
    });

    it("always places the winner on the wheel with a bounded, unique shortlist", () => {
      const pool = Array.from({ length: 13 }, (_, index) => ({
        activity: activity(`a${index}`),
        weight: 1,
      }));
      for (let attempt = 0; attempt < 200; attempt++) {
        const plan = planSpin(pool, { shortlistSize: 8, source: source(attempt + 1) });
        expect(plan).not.toBeNull();
        expect(plan?.segments).toHaveLength(8);
        expect(new Set(plan?.segments.map((entry) => entry.id)).size).toBe(8);
        expect(plan?.segments[plan.selectedIndex]?.id).toBe(plan?.winner.id);
        expect(
          plan?.segments.every((entry) => pool.some((item) => item.activity.id === entry.id)),
        ).toBe(true);
      }
    });

    it("shrinks the wheel instead of repeating entries on a small pool", () => {
      const pool = ["a", "b", "c"].map((id) => ({ activity: activity(id), weight: 1 }));
      const plan = planSpin(pool, { shortlistSize: 8, source: source(7) });
      expect(plan?.segments.map((entry) => entry.id).sort()).toEqual(["a", "b", "c"]);
      expect(plan?.selectedIndex).toBeGreaterThanOrEqual(0);
      expect(plan?.selectedIndex).toBeLessThan(3);
    });

    it("is uniform over the whole eligible pool", () => {
      const ids = ["a", "b", "c", "d", "e", "f", "g"];
      const pool = ids.map((id) => ({ activity: activity(id), weight: 1 }));
      const counts = new Map(ids.map((id) => [id, 0]));
      const draws = 14_000;
      const random = source(20261120);
      for (let attempt = 0; attempt < draws; attempt++) {
        const plan = planSpin(pool, { shortlistSize: 3, source: random });
        if (plan) counts.set(plan.winner.id, (counts.get(plan.winner.id) ?? 0) + 1);
      }
      const expected = draws / ids.length;
      let chiSquare = 0;
      for (const id of ids) chiSquare += ((counts.get(id) ?? 0) - expected) ** 2 / expected;
      // Six degrees of freedom: reject only a severe deviation (p < 0.001).
      expect(chiSquare).toBeLessThan(22.46);
      for (const id of ids) {
        const share = (counts.get(id) ?? 0) / draws;
        expect(share).toBeGreaterThan(0.1);
        expect(share).toBeLessThan(0.19);
      }
    });

    it("honours positive weights exactly", () => {
      const weights = [
        { id: "a", weight: 1 },
        { id: "b", weight: 1 },
        { id: "c", weight: 2 },
        { id: "d", weight: 4 },
      ];
      const pool = weights.map((entry) => ({ activity: activity(entry.id), weight: entry.weight }));
      const counts = new Map(weights.map((entry) => [entry.id, 0]));
      const draws = 16_000;
      for (let attempt = 0; attempt < draws; attempt++) {
        const plan = planSpin(pool, { shortlistSize: 2, source: source(attempt + 11) });
        if (plan) counts.set(plan.winner.id, (counts.get(plan.winner.id) ?? 0) + 1);
      }
      for (const entry of weights) {
        const share = (counts.get(entry.id) ?? 0) / draws;
        expect(Math.abs(share - entry.weight / 8)).toBeLessThan(0.03);
      }
    });

    it("never rejects a winner it was asked to keep", () => {
      const pool = [activity("a"), activity("b"), activity("c"), activity("d")];
      const plan = shortlistAround(pool, pool[2] as Activity, {
        shortlistSize: 2,
        source: source(3),
      });
      expect(plan.winner.id).toBe("c");
      expect(plan.segments[plan.selectedIndex]?.id).toBe("c");
      expect(plan.segments).toHaveLength(2);
    });
  });

  describe("result presentation", () => {
    it("clips wheel captions without breaking words", () => {
      expect(shortLabel("Short title")).toBe("Short title");
      expect(shortLabel("The unreasonably long hug", 12)).toBe("The unreaso…");
      expect(shortLabel("Compliments, on the house", 18)).toBe("Compliments, on…");
      expect(shortLabel("averylongsinglewordwithoutspaces", 10)).toBe("averylong…");
    });
  });
});
