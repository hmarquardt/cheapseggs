import type { AdultAssertion } from "./age-assurance";

export interface ContentAccessRule {
  tier: "public_preview" | "registered_adult" | "verified_adult" | "restricted";
  published: boolean;
  category: string;
  categoryOptInRequired: boolean;
  activityId: string;
  version: number;
  packId: string | null;
}
export interface ContentSubject {
  userId: string | null;
  registered: boolean;
  selfDeclaredAdult: boolean;
  verification: AdultAssertion | null;
  approvedCategories: readonly string[];
  /** Exact current-version YES; MAYBE/NO/unanswered never qualify. Per-request, not persisted. */
  activityApproval: { id: string; version: number; answer: "YES" | "MAYBE" | "NO" } | null;
  entitledPackIds: readonly string[];
}
export interface ContentMarketPolicy {
  approved: boolean;
  requiresVerification: boolean;
  jurisdictionPolicy: string;
  assurancePolicy: string;
  assuranceEnabled: boolean;
}
/** Heat is intentionally absent: publication, identity, age, category, activity and commerce are independent. */
export function contentAllowed(
  rule: ContentAccessRule,
  subject: ContentSubject,
  market: ContentMarketPolicy,
  now: number,
): boolean {
  if (!rule.published || rule.tier === "restricted") return false;
  if (rule.packId && !subject.entitledPackIds.includes(rule.packId)) return false;
  if (rule.categoryOptInRequired && !subject.approvedCategories.includes(rule.category))
    return false;
  if (rule.tier === "public_preview") return true;
  if (!market.approved || !subject.registered || !subject.selfDeclaredAdult) return false;
  const activity = subject.activityApproval;
  if (
    !activity ||
    activity.id !== rule.activityId ||
    activity.version !== rule.version ||
    activity.answer !== "YES"
  )
    return false;
  if (rule.tier === "verified_adult" || market.requiresVerification) {
    const assertion = subject.verification;
    if (
      !market.assuranceEnabled ||
      !assertion?.over18 ||
      assertion.subjectId !== subject.userId ||
      assertion.issuedAt > now ||
      assertion.expiresAt <= now ||
      assertion.policyVersion !== market.assurancePolicy ||
      assertion.jurisdictionPolicy !== market.jurisdictionPolicy
    )
      return false;
  }
  return true;
}
