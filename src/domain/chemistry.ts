/**
 * Deterministic Chemistry Check scoring.
 *
 * Acceptance first: each participant declares the partner answers they would accept.
 * Agreement is not compatibility. Hard requirements are evaluated separately and are
 * never represented as a large importance weight. Private-only responses are excluded
 * from every partner-visible value and never influence a shared report.
 */
import {
  CHEMISTRY_BANK_VERSION,
  CHEMISTRY_QUESTION_VERSION,
  type ChemistryDepth,
  type ChemistryDimensionId,
  type ChemistryQuestion,
  DIMENSIONS,
  MANIFESTS,
} from "../content/chemistry/questions";

export type Importance = "none" | "low" | "medium" | "high";
export const IMPORTANCE_WEIGHT: Readonly<Record<Importance, number>> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 4,
};

export const IMPORTANCE_OPTIONS: readonly { value: Importance; label: string }[] = [
  { value: "none", label: "Doesn't affect alignment" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export type AnswerState = "answered" | "skipped" | "not_applicable";
export type Disclosure = "summary" | "private";

export interface QuestionResponse {
  questionId: string;
  questionVersion: number;
  state: AnswerState;
  /** Canonical choice ids. Empty unless the state is `answered`. */
  own: readonly string[];
  /** Explicit accepted partner answers. `any` is explicit; `null` is unset/unknown. */
  accept: readonly string[] | "any" | null;
  importance: Importance;
  dealbreaker: boolean;
  disclosure: Disclosure;
}

export interface AssessmentSubmission {
  depth: ChemistryDepth;
  manifestId: string;
  questionBankVersion: string;
  responses: readonly QuestionResponse[];
  /** Separate explicit opt-in for the intimacy dimension's category band. */
  intimacyShared: boolean;
  /** Separate explicit approval for the coarse joint hard-conflict signal. */
  hardSignal: boolean;
}

export type Band = "largely_aligned" | "some_differences" | "worth_discussing";
export type BandReason =
  | "assessed"
  | "not_enough_shared_answers"
  | "intimacy_not_mutually_shared"
  | "both_directions_not_weighted"
  | "no_shared_answers"
  | "outside_approved_scope"
  | "report_withheld";

export type HardSignal =
  | "conflict_detected"
  | "none_detected_in_evaluated_scope"
  | "insufficient_information";

export interface DimensionOutcome {
  dimension: ChemistryDimensionId;
  band: Band | null;
  reason: BandReason;
  /** Internal only: never serialized into a shared report. */
  comparable: number;
  /** Coarse signal that a category contains at least one mutually accepted difference. */
  hasAcceptedDifferences: boolean;
}

export interface CompatibilityEvaluation {
  manifestId: string;
  depth: ChemistryDepth;
  coverage: "sufficient" | "insufficient";
  dimensions: readonly DimensionOutcome[];
  hardConflict: HardSignal;
  hardSignalAuthorized: boolean;
}

export const BAND_THRESHOLDS = { largelyAligned: 0.8, worthDiscussing: 0.5 } as const;
export const INTIMACY_MIN_COMPARABLE = 5;
export const DIMENSION_MIN_COMPARABLE = 3;
export const REPORT_MIN_DIMENSIONS = 3;

const ANSWER_STATES: readonly AnswerState[] = ["answered", "skipped", "not_applicable"];
const IMPORTANCE_VALUES: readonly Importance[] = ["none", "low", "medium", "high"];
const DISCLOSURES: readonly Disclosure[] = ["summary", "private"];

function choiceIds(question: ChemistryQuestion): ReadonlySet<string> {
  return new Set(question.choices.map((choice) => choice.id));
}

function isUniqueList(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

/** Structural validation. Returns codes only; never echoes answers. */
export function validateSubmission(submission: AssessmentSubmission): string[] {
  const errors: string[] = [];
  const manifest = MANIFESTS[submission.depth];
  if (!manifest || manifest.id !== submission.manifestId) errors.push("manifest_mismatch");
  if (submission.questionBankVersion !== CHEMISTRY_BANK_VERSION)
    errors.push("bank_version_mismatch");
  const questions = new Map(manifest.questions.map((question) => [question.id, question]));
  const seen = new Set<string>();
  for (const response of submission.responses) {
    const question = questions.get(response.questionId);
    if (!question) {
      errors.push("question_not_in_manifest");
      continue;
    }
    if (seen.has(response.questionId)) errors.push("duplicate_question");
    seen.add(response.questionId);
    if (response.questionVersion !== CHEMISTRY_QUESTION_VERSION)
      errors.push("question_version_mismatch");
    if (!ANSWER_STATES.includes(response.state)) errors.push("invalid_state");
    if (!IMPORTANCE_VALUES.includes(response.importance)) errors.push("invalid_importance");
    if (!DISCLOSURES.includes(response.disclosure)) errors.push("invalid_disclosure");
    const valid = choiceIds(question);
    if (!isUniqueList(response.own)) errors.push("duplicate_own_choice");
    if (response.own.some((id) => !valid.has(id))) errors.push("invalid_own_choice");
    if (question.kind === "single" && response.own.length > 1) errors.push("single_choice_only");
    if (response.state === "answered" && response.own.length === 0)
      errors.push("answered_requires_choice");
    if (response.state !== "answered" && response.own.length > 0) errors.push("unexpected_choice");
    if (response.accept !== null && response.accept !== "any") {
      if (!isUniqueList(response.accept)) errors.push("duplicate_accepted_choice");
      if (response.accept.some((id) => !valid.has(id))) errors.push("invalid_accepted_choice");
    }
    if (response.dealbreaker && response.accept === null)
      errors.push("dealbreaker_requires_acceptance");
  }
  return [...new Set(errors)];
}

export function answered(response: QuestionResponse | undefined): boolean {
  return Boolean(response && response.state === "answered" && response.own.length > 0);
}

/** Multi-select answers are acceptable only when every selected option is accepted. */
export function acceptsAnswer(response: QuestionResponse, partnerOwn: readonly string[]): boolean {
  const accepted = response.accept;
  if (accepted === null || partnerOwn.length === 0) return false;
  if (accepted === "any") return true;
  return partnerOwn.every((id) => accepted.includes(id));
}

function sameAnswer(first: readonly string[], second: readonly string[]): boolean {
  if (first.length !== second.length) return false;
  const set = new Set(first);
  return second.every((id) => set.has(id));
}

interface DimensionTotals {
  count: number;
  numeratorA: number;
  numeratorB: number;
  weightA: number;
  weightB: number;
  acceptedDifferences: number;
}

function emptyTotals(): DimensionTotals {
  return { count: 0, numeratorA: 0, numeratorB: 0, weightA: 0, weightB: 0, acceptedDifferences: 0 };
}

function bandFor(reciprocal: number): Band {
  if (reciprocal >= BAND_THRESHOLDS.largelyAligned) return "largely_aligned";
  if (reciprocal >= BAND_THRESHOLDS.worthDiscussing) return "some_differences";
  return "worth_discussing";
}

function isComparable(
  question: ChemistryQuestion,
  first: QuestionResponse | undefined,
  second: QuestionResponse | undefined,
): boolean {
  if (!first || !second) return false;
  if (first.questionVersion !== question.version || second.questionVersion !== question.version)
    return false;
  // Check disclosure before examining answer content or state.
  if (first.disclosure !== "summary" || second.disclosure !== "summary") return false;
  if (!answered(first) || !answered(second)) return false;
  return first.accept !== null && second.accept !== null;
}

/**
 * Evaluate a pair over the same authorized comparable set. This function is pure:
 * private-only responses can never change its output.
 */
export function evaluateCompatibility(
  first: AssessmentSubmission,
  second: AssessmentSubmission,
  options: { dimensions?: readonly ChemistryDimensionId[] } = {},
): CompatibilityEvaluation {
  const manifest = MANIFESTS[first.depth];
  const totals = new Map<ChemistryDimensionId, DimensionTotals>(
    DIMENSIONS.map((dimension) => [dimension.id, emptyTotals()]),
  );
  const firstById = new Map(first.responses.map((response) => [response.questionId, response]));
  const secondById = new Map(second.responses.map((response) => [response.questionId, response]));

  for (const question of manifest.questions) {
    const a = firstById.get(question.id);
    const b = secondById.get(question.id);
    if (!a || !b || !isComparable(question, a, b)) continue;
    const weightA = IMPORTANCE_WEIGHT[a.importance];
    const weightB = IMPORTANCE_WEIGHT[b.importance];
    const entry = totals.get(question.dimension);
    if (!entry) continue;
    const acceptsA = acceptsAnswer(a, b.own);
    const acceptsB = acceptsAnswer(b, a.own);
    entry.count += 1;
    entry.weightA += weightA;
    entry.weightB += weightB;
    if (acceptsA) entry.numeratorA += weightA;
    if (acceptsB) entry.numeratorB += weightB;
    if (acceptsA && acceptsB && !sameAnswer(a.own, b.own)) entry.acceptedDifferences += 1;
  }

  const intimacyMutual = first.intimacyShared && second.intimacyShared;
  const dimensions: DimensionOutcome[] = DIMENSIONS.map((dimension) => {
    const entry = totals.get(dimension.id) ?? emptyTotals();
    const accepted = entry.acceptedDifferences > 0;
    if (options.dimensions && !options.dimensions.includes(dimension.id)) {
      return {
        dimension: dimension.id,
        band: null,
        reason: "outside_approved_scope",
        comparable: 0,
        hasAcceptedDifferences: false,
      };
    }
    if (dimension.id === "intimacy" && !intimacyMutual) {
      return {
        dimension: dimension.id,
        band: null,
        reason: "intimacy_not_mutually_shared",
        comparable: entry.count,
        hasAcceptedDifferences: false,
      };
    }
    if (entry.count === 0) {
      return {
        dimension: dimension.id,
        band: null,
        reason: "no_shared_answers",
        comparable: 0,
        hasAcceptedDifferences: false,
      };
    }
    const minimum =
      dimension.id === "intimacy" ? INTIMACY_MIN_COMPARABLE : DIMENSION_MIN_COMPARABLE;
    if (entry.count < minimum) {
      return {
        dimension: dimension.id,
        band: null,
        reason: "not_enough_shared_answers",
        comparable: entry.count,
        hasAcceptedDifferences: false,
      };
    }
    if (entry.weightA === 0 || entry.weightB === 0) {
      return {
        dimension: dimension.id,
        band: null,
        reason: "both_directions_not_weighted",
        comparable: entry.count,
        hasAcceptedDifferences: false,
      };
    }
    // Conservative min(): one satisfied person cannot conceal the other's mismatch.
    const reciprocal = Math.min(entry.numeratorA / entry.weightA, entry.numeratorB / entry.weightB);
    return {
      dimension: dimension.id,
      band: bandFor(reciprocal),
      reason: "assessed",
      comparable: entry.count,
      hasAcceptedDifferences: accepted,
    };
  });

  const assessed = dimensions.filter((dimension) => dimension.band !== null).length;
  return {
    manifestId: manifest.id,
    depth: first.depth,
    coverage: assessed >= REPORT_MIN_DIMENSIONS ? "sufficient" : "insufficient",
    dimensions,
    hardConflict: evaluateHardConflict(
      manifest.questions.filter(
        (question) =>
          (!options.dimensions || options.dimensions.includes(question.dimension)) &&
          (question.dimension !== "intimacy" || intimacyMutual),
      ),
      firstById,
      secondById,
    ),
    hardSignalAuthorized: first.hardSignal && second.hardSignal,
  };
}

function evaluateHardConflict(
  questions: readonly ChemistryQuestion[],
  first: ReadonlyMap<string, QuestionResponse>,
  second: ReadonlyMap<string, QuestionResponse>,
): HardSignal {
  let evaluable = 0;
  let unevaluable = 0;
  let conflict = false;
  const check = (owner: QuestionResponse | undefined, partner: QuestionResponse | undefined) => {
    if (!owner?.dealbreaker) return;
    // A private-only rule may not influence any partner-visible flag.
    if (owner.disclosure !== "summary") return;
    if (!answered(owner) || owner.accept === null) {
      unevaluable += 1;
      return;
    }
    if (!partner || partner.disclosure !== "summary" || !answered(partner)) {
      unevaluable += 1;
      return;
    }
    evaluable += 1;
    if (!acceptsAnswer(owner, partner.own)) conflict = true;
  };
  for (const question of questions) {
    check(first.get(question.id), second.get(question.id));
    check(second.get(question.id), first.get(question.id));
  }
  if (conflict) return "conflict_detected";
  if (unevaluable > 0) return "insufficient_information";
  if (evaluable > 0) return "none_detected_in_evaluated_scope";
  return "insufficient_information";
}

// ------------------------------------------------------------ shared report

export interface ReportDimension {
  dimension: ChemistryDimensionId;
  title: string;
  band: Band | null;
  detail: BandReason;
}

export interface SharedReport {
  version: 1;
  manifestId: string;
  depth: ChemistryDepth;
  available: boolean;
  coverage: CompatibilityEvaluation["coverage"];
  dimensions: readonly ReportDimension[];
  strongAlignment: readonly ChemistryDimensionId[];
  mutuallyAcceptableDifferences: readonly ChemistryDimensionId[];
  worthDiscussing: readonly ChemistryDimensionId[];
  unassessed: readonly ChemistryDimensionId[];
  conversationStarters: readonly string[];
  /** Null when either participant withheld approval for the joint signal. */
  hardConflict: HardSignal | null;
  disclosures: readonly string[];
}

export const REPORT_DISCLOSURES: readonly string[] = [
  "This describes the answers you chose to include. It cannot predict chemistry, honesty, safety or relationship outcomes.",
  "Bands describe broad category alignment, not a verdict about either person.",
  "No overall match percentage is shown. Category bands may still reveal aggregate information about both participants.",
  "Private-only answers never affect this report, including its availability and topics.",
];

export function dimensionTitle(dimension: ChemistryDimensionId): string {
  return DIMENSIONS.find((entry) => entry.id === dimension)?.title ?? dimension;
}

export function buildSharedReport(evaluation: CompatibilityEvaluation): SharedReport {
  const available = evaluation.coverage === "sufficient";
  const dimensions: ReportDimension[] = evaluation.dimensions.map((outcome) => ({
    dimension: outcome.dimension,
    title: dimensionTitle(outcome.dimension),
    band: available ? outcome.band : null,
    detail: available ? outcome.reason : "report_withheld",
  }));
  if (!available) {
    return {
      version: 1,
      manifestId: evaluation.manifestId,
      depth: evaluation.depth,
      available: false,
      coverage: evaluation.coverage,
      dimensions,
      strongAlignment: [],
      mutuallyAcceptableDifferences: [],
      worthDiscussing: [],
      unassessed: evaluation.dimensions.map((outcome) => outcome.dimension),
      conversationStarters: [],
      hardConflict: null,
      disclosures: REPORT_DISCLOSURES,
    };
  }
  const byBand = (band: Band) =>
    evaluation.dimensions
      .filter((outcome) => outcome.band === band)
      .map((outcome) => outcome.dimension);
  const assessed = evaluation.dimensions.filter((outcome) => outcome.band !== null);
  const starters: string[] = [];
  for (const outcome of assessed) {
    const template = DIMENSIONS.find((entry) => entry.id === outcome.dimension)?.starters[0];
    if (template) starters.push(template);
    if (starters.length === 4) break;
  }
  return {
    version: 1,
    manifestId: evaluation.manifestId,
    depth: evaluation.depth,
    available: true,
    coverage: evaluation.coverage,
    dimensions,
    strongAlignment: byBand("largely_aligned"),
    mutuallyAcceptableDifferences: assessed
      .filter((outcome) => outcome.hasAcceptedDifferences)
      .map((outcome) => outcome.dimension),
    worthDiscussing: [...byBand("worth_discussing"), ...byBand("some_differences")],
    unassessed: evaluation.dimensions
      .filter((outcome) => outcome.band === null)
      .map((outcome) => outcome.dimension),
    conversationStarters: starters,
    hardConflict: evaluation.hardSignalAuthorized ? evaluation.hardConflict : null,
    disclosures: REPORT_DISCLOSURES,
  };
}
