import { z } from "zod";

export const activitySchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string(),
  tags: z.array(z.string()),
  heat: z.number().int().min(0).max(3),
  experimentation: z.number().int().min(0).max(2),
  energy: z.number().int().min(0).max(2),
  durationMinutes: z.number().int().positive(),
  environments: z.array(z.enum(["home", "hotel", "getaway", "private-other"])).min(1),
  supplies: z.array(z.string()),
  preparation: z.array(z.string()),
  accessibility: z.array(z.string()),
  safetyFlags: z.array(z.string()),
  requiredOptIns: z.array(z.string()),
  incompatibleWith: z.array(z.string()),
  phases: z.array(z.enum(["setup", "warm-up", "main", "reconnect"])).min(1),
  status: z.enum(["draft", "published", "withdrawn"]),
  packId: z.string().nullable(),
});

export type Activity = z.infer<typeof activitySchema>;
export type Preference = "yes" | "maybe" | "no" | "hard-no";
export type Mode = "discovery" | "mutual" | "solo";
export type VersionedApproval = { version: number; response: Preference };

export interface EligibilityContext {
  mode: Mode;
  maxHeat: number;
  maxExperimentation: number;
  maxEnergy: number;
  availableMinutes: number;
  environment: Activity["environments"][number];
  supplies: ReadonlySet<string>;
  excludedActivities: ReadonlySet<string>;
  excludedCategories: ReadonlySet<string>;
  optIns: ReadonlySet<string>;
  accessiblePackIds: ReadonlySet<string>;
  recentActivityIds: ReadonlySet<string>;
  participantApprovals: readonly ReadonlyMap<string, VersionedApproval>[];
  relationshipActive: boolean;
}
