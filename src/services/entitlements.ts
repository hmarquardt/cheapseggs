export type GrantKind = "free" | "ownership" | "subscription" | "trial" | "promotion" | "gift";
export interface Entitlement {
  userId: string;
  packId: string;
  kind: GrantKind;
  status: "active" | "suspended" | "revoked" | "refunded";
  startsAt: number;
  endsAt: number | null;
  shareWithPartner: boolean;
}
export interface EntitlementRepository {
  /** Must query authoritative server state, never client claims. */
  findForOwners(ownerIds: readonly string[]): Promise<readonly Entitlement[]>;
}
export interface AccessSubject {
  userId: string;
  /** Derived from a current two-person active relationship by the server. */
  activePartnerUserId: string | null;
}

export async function canAccessPack(
  repository: EntitlementRepository,
  subject: AccessSubject,
  packId: string | null,
  now: number,
): Promise<boolean> {
  if (packId === null) return true;
  const owners = [subject.userId];
  if (subject.activePartnerUserId) owners.push(subject.activePartnerUserId);
  const grants = await repository.findForOwners(owners);
  return grants.some(
    (grant) =>
      grant.packId === packId &&
      grant.status === "active" &&
      grant.startsAt <= now &&
      (grant.endsAt === null || grant.endsAt > now) &&
      (grant.userId === subject.userId ||
        (grant.userId === subject.activePartnerUserId && grant.shareWithPartner)),
  );
}
