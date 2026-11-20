import { z } from "zod";
import type { Activity, Mode } from "./catalog";

/** Validated future configuration; identity, approval pools and entitlements are server-derived. */
export const dateNightRequestSchema = z.strictObject({
  heat: z.enum(["mild", "medium", "spicy", "habanero"]),
  experimentation: z.enum(["classic", "curious", "adventurous"]),
  mood: z.enum(["romantic", "playful", "adventurous"]),
  energy: z.enum(["low", "moderate", "high"]),
  duration: z.enum(["quickie", "30-minutes", "hour", "all-evening"]),
  environment: z.enum(["home", "hotel", "getaway", "private-other"]),
  supplies: z.array(z.string().min(1).max(80)).max(30),
  ownExclusions: z.array(z.string().min(1).max(80)).max(100),
  accessibilityRequirements: z.array(z.string().min(1).max(80)).max(20),
});

export interface CatalogReference {
  id: string;
  version: number;
}

export interface Membership {
  userId: string;
  coupleId: string;
  slot: 1 | 2;
  state: "active" | "revoked";
}

/** Internal authorization stamp, never a replacement for revalidation or a client capability. */
export interface SharedAuthorizationStamp {
  coupleId: string;
  consentEpoch: number;
  catalogRevision: string;
  expiresAt: number;
}

export interface WheelDefinition extends CatalogReference {
  title: string;
  selectionPolicy: "uniform" | "weighted";
  segments: readonly { activity: CatalogReference; weight: number }[];
}

export interface RecipeStep {
  phase: Activity["phases"][number];
  activity: CatalogReference;
  alternatives: readonly CatalogReference[];
  optional: boolean;
}

export interface RecipePlan {
  id: string;
  mode: Mode;
  template: CatalogReference;
  totalMinutes: number;
  supplies: readonly string[];
  preparation: readonly string[];
  steps: readonly RecipeStep[];
  sharedAuthorization: SharedAuthorizationStamp | null;
}
