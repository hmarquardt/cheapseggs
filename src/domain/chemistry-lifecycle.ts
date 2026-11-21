/** Assessment-specific lifecycle and release-scope primitives. No couple concepts. */
import {
  CHEMISTRY_BANK_VERSION,
  type ChemistryDimensionId,
  DIMENSIONS,
} from "../content/chemistry/questions";

export const CHEMISTRY_FAMILY = CHEMISTRY_BANK_VERSION;
export const CHEMISTRY_ALGORITHM_VERSION = "chemistry-scoring-1";
export const INVITATION_TTL_SECONDS = 48 * 3600;
export const ASSESSMENT_TTL_SECONDS = 14 * 86400;
export const REPORT_TTL_SECONDS = 30 * 86400;
export const PURGE_GRACE_SECONDS = 24 * 3600;
export const PAIR_COOLDOWN_SECONDS = 30 * 86400;
export const DAILY_INVITATION_LIMIT = 5;
export const ACTIVE_INVITATION_LIMIT = 3;

export type ChemistryStatus =
  | "draft"
  | "invited"
  | "collecting"
  | "awaiting_release"
  | "released"
  | "declined"
  | "withdrawn"
  | "expired"
  | "deleted";

export const TERMINAL_STATUSES: readonly ChemistryStatus[] = [
  "declined",
  "withdrawn",
  "expired",
  "deleted",
];

export const LIVE_PAIR_STATUSES: readonly ChemistryStatus[] = [
  "collecting",
  "awaiting_release",
  "released",
];

export function isTerminal(status: ChemistryStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isLivePair(status: ChemistryStatus): boolean {
  return LIVE_PAIR_STATUSES.includes(status);
}

/** Canonical, private pair identity: unordered user ids plus question-bank family. */
export function pairKey(first: string, second: string): string {
  return `${[first, second].sort().join("|")}|${CHEMISTRY_FAMILY}`;
}

export function assessmentExpiresAt(acceptedAt: number): number {
  return acceptedAt + ASSESSMENT_TTL_SECONDS;
}

/** The report can never outlive the assessment's original 30-day result window. */
export function reportExpiresAt(acceptedAt: number): number {
  return acceptedAt + REPORT_TTL_SECONDS;
}

export function purgeAt(now: number): number {
  return now + PURGE_GRACE_SECONDS;
}

export interface ReleaseScope {
  dimensions: readonly ChemistryDimensionId[];
  intimacyShared: boolean;
  hardSignal: boolean;
  expiresAt: number;
}

const DIMENSION_IDS = new Set<string>(DIMENSIONS.map((dimension) => dimension.id));

/** Bounded, canonical scope. Returns null for unknown, duplicate or empty dimension lists. */
export function normalizeScope(input: {
  dimensions: readonly string[];
  intimacyShared: boolean;
  hardSignal: boolean;
  expiresAt: number;
}): ReleaseScope | null {
  if (!Array.isArray(input.dimensions) || input.dimensions.length === 0) return null;
  if (input.dimensions.length > DIMENSIONS.length) return null;
  if (new Set(input.dimensions).size !== input.dimensions.length) return null;
  if (input.dimensions.some((id) => !DIMENSION_IDS.has(id))) return null;
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= 0) return null;
  return {
    dimensions: [...input.dimensions].sort() as ChemistryDimensionId[],
    intimacyShared: input.intimacyShared === true,
    hardSignal: input.hardSignal === true,
    expiresAt: input.expiresAt,
  };
}

/** Intersection of two approvals. Unshared flags narrow the report; deadlines must match. */
export function intersectScopes(first: ReleaseScope, second: ReleaseScope): ReleaseScope | null {
  if (first.expiresAt !== second.expiresAt) return null;
  const secondDimensions = new Set(second.dimensions);
  const dimensions = first.dimensions.filter((dimension) => secondDimensions.has(dimension));
  if (dimensions.length === 0) return null;
  return {
    dimensions,
    intimacyShared: first.intimacyShared && second.intimacyShared,
    hardSignal: first.hardSignal && second.hardSignal,
    expiresAt: first.expiresAt,
  };
}

/** Canonical material hashed into an approval digest; contains no answers or rules. */
export function scopeMaterial(input: {
  assessmentId: string;
  resultEpoch: number;
  submissionRevision: number;
  manifestId: string;
  scope: ReleaseScope;
}): string {
  return JSON.stringify({
    v: 1,
    assessmentId: input.assessmentId,
    resultEpoch: input.resultEpoch,
    submissionRevision: input.submissionRevision,
    manifestId: input.manifestId,
    algorithmVersion: CHEMISTRY_ALGORITHM_VERSION,
    dimensions: [...input.scope.dimensions].sort(),
    intimacyShared: input.scope.intimacyShared,
    hardSignal: input.scope.hardSignal,
    expiresAt: input.scope.expiresAt,
  });
}
