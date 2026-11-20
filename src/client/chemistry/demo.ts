/**
 * Demonstration-only synthetic participant.
 *
 * Nothing here is sent to a server, stored, or used to infer anything about a real
 * person. It exists so a visitor can see the shape of a mutually authorized report
 * before real independent assessments open.
 */
import {
  CHEMISTRY_BANK_VERSION,
  type ChemistryDepth,
  type ChemistryQuestion,
  MANIFESTS,
} from "../../content/chemistry/questions";
import type { AssessmentSubmission, Importance, QuestionResponse } from "../../domain/chemistry";

/** Deterministic FNV-1a with an avalanche finalizer: the same seed always produces the same demonstration partner. */
function hash(input: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
}

const IMPORTANCE_CYCLE: readonly Importance[] = ["low", "medium", "medium", "high", "high"];

function selectOwn(question: ChemistryQuestion, seed: number): readonly string[] {
  if (question.kind === "multi") {
    const first = seed % question.choices.length;
    const second = (first + 1 + (seed % 2)) % question.choices.length;
    const ids = new Set<string>();
    const firstChoice = question.choices[first];
    if (firstChoice) ids.add(firstChoice.id);
    const secondChoice = question.choices[second];
    if (secondChoice) ids.add(secondChoice.id);
    return [...ids];
  }
  const choice = question.choices[seed % question.choices.length];
  return choice ? [choice.id] : [];
}

/** Acceptance rules vary: explicit any, strict same-answer, or one neighbouring answer. */
function selectAccept(
  question: ChemistryQuestion,
  own: readonly string[],
  seed: number,
): string[] | "any" {
  if (question.kind === "multi") return "any";
  const bucket = seed % 100;
  if (bucket < 35) return "any";
  const ownId = own[0];
  if (!ownId) return "any";
  const index = question.choices.findIndex((choice) => choice.id === ownId);
  if (index < 0) return "any";
  if (bucket < 60) return [ownId];
  const offset = bucket % 2 === 0 ? -1 : 1;
  const neighbour = question.choices[index + offset] ?? question.choices[index - offset];
  return neighbour ? [ownId, neighbour.id] : [ownId];
}

export function syntheticResponses(depth: ChemistryDepth, seed: string): QuestionResponse[] {
  return MANIFESTS[depth].questions.map((question) => {
    const value = hash(`${seed}:${question.id}`);
    const state = value % 23 === 0 ? "skipped" : "answered";
    if (state === "skipped") {
      return {
        questionId: question.id,
        questionVersion: question.version,
        state,
        own: [],
        accept: null,
        importance: "medium",
        dealbreaker: false,
        disclosure: question.intimate ? "private" : "summary",
      };
    }
    const own = selectOwn(question, value);
    const accept = selectAccept(question, own, value >> 3);
    const dealbreaker = question.kind === "single" && value % 19 === 0;
    return {
      questionId: question.id,
      questionVersion: question.version,
      state,
      own,
      accept,
      importance: IMPORTANCE_CYCLE[value % IMPORTANCE_CYCLE.length] ?? "medium",
      dealbreaker,
      disclosure: question.intimate || value % 13 === 0 ? "private" : "summary",
    };
  });
}

export function syntheticSubmission(
  depth: ChemistryDepth,
  seed: string,
  options: { hardSignal?: boolean } = {},
): AssessmentSubmission {
  return {
    depth,
    manifestId: MANIFESTS[depth].id,
    questionBankVersion: CHEMISTRY_BANK_VERSION,
    responses: syntheticResponses(depth, seed),
    // The demonstration partner keeps intimacy private and approves the joint signal.
    intimacyShared: false,
    hardSignal: options.hardSignal ?? true,
  };
}
