import { describe, expect, it } from "vitest";
import { app } from "../../src/server";
import {
  type ContentAccessRule,
  type ContentMarketPolicy,
  type ContentSubject,
  contentAllowed,
} from "../../src/services/content-access";
import { createTestDatabase } from "../support/d1";

const rule: ContentAccessRule = {
  tier: "verified_adult",
  published: true,
  category: "sensitive",
  categoryOptInRequired: true,
  activityId: "activity",
  version: 2,
  packId: "pack",
};
const subject: ContentSubject = {
  userId: "a",
  registered: true,
  selfDeclaredAdult: true,
  verification: {
    subjectId: "a",
    provider: "test",
    assertionId: "test",
    over18: true,
    method: "digital_identity",
    policyVersion: "test-v1",
    jurisdictionPolicy: "test-market",
    issuedAt: 1,
    expiresAt: 100,
  },
  approvedCategories: ["sensitive"],
  activityApproval: { id: "activity", version: 2, answer: "YES" },
  entitledPackIds: ["pack"],
};
const market: ContentMarketPolicy = {
  approved: true,
  requiresVerification: true,
  jurisdictionPolicy: "test-market",
  assurancePolicy: "test-v1",
  assuranceEnabled: true,
};
describe("independent access dimensions", () => {
  it("requires all dimensions and exact-version YES for restricted adult use", () => {
    expect(contentAllowed(rule, subject, market, 50)).toBe(true);
    if (!subject.verification) throw new Error("test assertion missing");
    for (const patch of [
      { registered: false },
      { userId: "foreign-user" },
      { selfDeclaredAdult: false },
      { verification: null },
      { approvedCategories: [] },
      { activityApproval: null },
      { entitledPackIds: [] },
      { activityApproval: { id: "activity", version: 1, answer: "YES" as const } },
      { activityApproval: { id: "activity", version: 2, answer: "MAYBE" as const } },
      { verification: { ...subject.verification, expiresAt: 49 } },
      { verification: { ...subject.verification, policyVersion: "old" } },
      { verification: { ...subject.verification, jurisdictionPolicy: "other" } },
    ])
      expect(contentAllowed(rule, { ...subject, ...patch }, market, 50)).toBe(false);
    expect(contentAllowed(rule, subject, { ...market, approved: false }, 50)).toBe(false);
    expect(contentAllowed(rule, subject, { ...market, assuranceEnabled: false }, 50)).toBe(false);
    expect(contentAllowed({ ...rule, published: false }, subject, market, 50)).toBe(false);
    expect(contentAllowed({ ...rule, tier: "restricted" }, subject, market, 50)).toBe(false);
  });
  it("supports registered self-declaration only in an explicitly reviewed market", () => {
    const registered = { ...rule, tier: "registered_adult" as const };
    expect(
      contentAllowed(
        registered,
        { ...subject, verification: null },
        { ...market, requiresVerification: false },
        50,
      ),
    ).toBe(true);
    expect(contentAllowed(registered, { ...subject, verification: null }, market, 50)).toBe(false);
  });
  it("preserves public preview and independently requires category approval", () => {
    const preview = {
      ...rule,
      tier: "public_preview" as const,
      packId: null,
      categoryOptInRequired: false,
    };
    expect(
      contentAllowed(
        preview,
        {
          ...subject,
          registered: false,
          selfDeclaredAdult: false,
          verification: null,
          activityApproval: null,
        },
        { ...market, approved: false },
        50,
      ),
    ).toBe(true);
    expect(
      contentAllowed(
        { ...preview, categoryOptInRequired: true },
        { ...subject, approvedCategories: [] },
        market,
        50,
      ),
    ).toBe(false);
  });
  it("never leaks a newly published or manually reclassified restricted record through the preview wheel", async () => {
    const { db, raw } = createTestDatabase();
    const env = { DB: db, APP_ENV: "local" };
    try {
      raw.exec(
        "UPDATE activity_versions SET access_tier = 'verified_adult' WHERE activity_id = 'playlist'",
      );
      const preview = await app.request("/api/v1/catalog/preview", undefined, env);
      expect(JSON.stringify(await preview.json())).not.toContain('"playlist"');
      const wheel = await app.request("/api/v1/wheels/misfortune", undefined, env);
      expect(JSON.stringify(await wheel.json())).not.toContain('"playlist"');
      expect((await app.request("/api/v1/content/playlist/1", undefined, env)).status).toBe(404);
      expect((await app.request("/api/v1/content/compliments/1", undefined, env)).status).toBe(200);
    } finally {
      raw.close();
    }
  });
});
