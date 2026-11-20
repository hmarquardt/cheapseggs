import { describe, expect, it } from "vitest";
import type { Activity, EligibilityContext, Preference } from "../../src/domain/catalog";
import { activitySchema } from "../../src/domain/catalog";
import { compatiblePair, eligibleActivities } from "../../src/domain/eligibility";

const activity: Activity = {
  id: "example",
  version: 2,
  title: "Example",
  description: "Fixture",
  category: "connection",
  tags: [],
  heat: 0,
  experimentation: 0,
  energy: 0,
  durationMinutes: 5,
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
};
function context(response: Preference = "yes"): EligibilityContext {
  return {
    mode: "mutual",
    maxHeat: 3,
    maxExperimentation: 2,
    maxEnergy: 2,
    availableMinutes: 30,
    environment: "home",
    supplies: new Set(),
    excludedActivities: new Set(),
    excludedCategories: new Set(),
    optIns: new Set(),
    accessiblePackIds: new Set(),
    recentActivityIds: new Set(),
    relationshipActive: true,
    participantApprovals: [
      new Map([["example", { version: 2, response: "yes" }]]),
      new Map([["example", { version: 2, response }]]),
    ],
  };
}

describe("eligibility boundaries", () => {
  it("permits only current YES/YES approvals in mutual mode", () => {
    expect(eligibleActivities([activity], context())).toEqual([activity]);
  });
  it.each(["maybe", "no", "hard-no"] as const)("excludes %s without fallback", (response) => {
    expect(eligibleActivities([activity], context(response))).toEqual([]);
  });
  it("excludes stale approvals after a content change", () => {
    expect(eligibleActivities([{ ...activity, version: 3 }], context())).toEqual([]);
  });
  it("requires an active two-person relationship", () => {
    expect(eligibleActivities([activity], { ...context(), relationshipActive: false })).toEqual([]);
    expect(eligibleActivities([activity], { ...context(), participantApprovals: [] })).toEqual([]);
  });
  it("never lets a paid pack override a boundary", () => {
    const c = {
      ...context(),
      accessiblePackIds: new Set(["paid"]),
      excludedActivities: new Set(["example"]),
    };
    expect(eligibleActivities([{ ...activity, packId: "paid" }], c)).toEqual([]);
  });
  it("requires explicit opt-in even at maximum heat", () => {
    expect(
      eligibleActivities([{ ...activity, requiredOptIns: ["specific-category"] }], context()),
    ).toEqual([]);
  });
  it("does not reset repeat exclusions on an empty pool", () => {
    expect(
      eligibleActivities([activity], { ...context(), recentActivityIds: new Set(["example"]) }),
    ).toEqual([]);
  });
  it.each([
    { status: "withdrawn" as const },
    { heat: 3 },
    { supplies: ["missing"] },
    { durationMinutes: 60 },
    { environments: ["hotel"] as Activity["environments"] },
  ])("applies catalog and context restrictions: %o", (change) => {
    expect(eligibleActivities([{ ...activity, ...change }], { ...context(), maxHeat: 1 })).toEqual(
      [],
    );
  });
  it("applies category exclusions and pack entitlement checks", () => {
    expect(
      eligibleActivities([activity], { ...context(), excludedCategories: new Set(["connection"]) }),
    ).toEqual([]);
    expect(eligibleActivities([{ ...activity, packId: "locked" }], context())).toEqual([]);
  });
  it("discovery is independent of partner answers and still respects exclusions", () => {
    expect(eligibleActivities([activity], { ...context("no"), mode: "discovery" })).toEqual([
      activity,
    ]);
    expect(
      eligibleActivities([activity], {
        ...context(),
        mode: "solo",
        excludedActivities: new Set(["example"]),
      }),
    ).toEqual([]);
  });
  it("detects incompatibility in either direction", () => {
    expect(
      compatiblePair(activity, { ...activity, id: "other", incompatibleWith: ["example"] }),
    ).toBe(false);
  });
  it("validates out-of-range catalog data", () => {
    expect(activitySchema.safeParse({ ...activity, heat: 99 }).success).toBe(false);
  });
});
