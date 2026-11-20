import { describe, expect, it } from "vitest";
import { canAccessPack, type Entitlement } from "../../src/services/entitlements";

const grant: Entitlement = {
  userId: "buyer",
  packId: "pack",
  kind: "ownership",
  status: "active",
  startsAt: 100,
  endsAt: null,
  shareWithPartner: true,
};
const subject = { userId: "viewer", activePartnerUserId: "buyer" };
const repository = (...grants: Entitlement[]) => ({ findForOwners: async () => grants });

describe("commercial access independent of consent", () => {
  it("allows free content without consulting billing", async () => {
    expect(await canAccessPack(repository(), subject, null, 101)).toBe(true);
  });
  it("shares buyer access only through a current relationship", async () => {
    expect(await canAccessPack(repository(grant), subject, "pack", 101)).toBe(true);
    expect(
      await canAccessPack(
        repository(grant),
        { ...subject, activePartnerUserId: null },
        "pack",
        101,
      ),
    ).toBe(false);
    expect(
      await canAccessPack(repository({ ...grant, shareWithPartner: false }), subject, "pack", 101),
    ).toBe(false);
  });
  it.each(["refunded", "revoked", "suspended"] as const)("rejects %s grants", async (status) => {
    expect(await canAccessPack(repository({ ...grant, status }), subject, "pack", 101)).toBe(false);
  });
  it("enforces time windows including expiry equality", async () => {
    expect(await canAccessPack(repository(grant), subject, "pack", 99)).toBe(false);
    expect(await canAccessPack(repository({ ...grant, endsAt: 101 }), subject, "pack", 101)).toBe(
      false,
    );
  });
  it("does not allow unrelated owner grants or a different pack", async () => {
    expect(
      await canAccessPack(repository({ ...grant, userId: "stranger" }), subject, "pack", 101),
    ).toBe(false);
    expect(await canAccessPack(repository(grant), subject, "another-pack", 101)).toBe(false);
  });
});
