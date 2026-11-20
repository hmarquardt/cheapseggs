import type { Activity, EligibilityContext } from "./catalog";

/** Pure policy, with no random behavior. Never send rejection reasons to a partner. */
export function eligibleActivities(
  catalog: readonly Activity[],
  context: EligibilityContext,
): Activity[] {
  if (
    context.mode === "mutual" &&
    (!context.relationshipActive || context.participantApprovals.length !== 2)
  )
    return [];

  return catalog.filter((activity) => {
    if (
      activity.status !== "published" ||
      activity.heat > context.maxHeat ||
      activity.experimentation > context.maxExperimentation ||
      activity.energy > context.maxEnergy ||
      activity.durationMinutes > context.availableMinutes ||
      !activity.environments.includes(context.environment) ||
      context.excludedActivities.has(activity.id) ||
      context.excludedCategories.has(activity.category) ||
      context.recentActivityIds.has(activity.id) ||
      (activity.packId !== null && !context.accessiblePackIds.has(activity.packId)) ||
      !activity.supplies.every((supply) => context.supplies.has(supply)) ||
      !activity.requiredOptIns.every((optIn) => context.optIns.has(optIn))
    )
      return false;

    if (context.mode !== "mutual") return true;
    return context.participantApprovals.every((approvals) => {
      const approval = approvals.get(activity.id);
      return approval?.response === "yes" && approval.version === activity.version;
    });
  });
}

/** Empty repeat-excluded pools stay empty. Never widen boundaries to make a spin possible. */
export function compatiblePair(a: Activity, b: Activity): boolean {
  return a.id !== b.id && !a.incompatibleWith.includes(b.id) && !b.incompatibleWith.includes(a.id);
}
