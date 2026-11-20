import { describe, expect, it } from "vitest";
import { syntheticSubmission } from "../../src/client/chemistry/demo";
import {
  CHEMISTRY_BANK_VERSION,
  CHEMISTRY_QUESTION_VERSION,
  type ChemistryDepth,
  type ChemistryQuestion,
  DIMENSIONS,
  MANIFESTS,
} from "../../src/content/chemistry/questions";
import {
  type AssessmentSubmission,
  buildSharedReport,
  evaluateCompatibility,
  type QuestionResponse,
  validateSubmission,
} from "../../src/domain/chemistry";

function firstId(question: ChemistryQuestion, index = 0): string {
  const choice = question.choices[index];
  if (!choice) throw new Error(`missing choice ${index} for ${question.id}`);
  return choice.id;
}

function response(
  question: ChemistryQuestion,
  own: readonly string[],
  accept: QuestionResponse["accept"],
  options: Partial<
    Pick<QuestionResponse, "importance" | "dealbreaker" | "disclosure" | "state">
  > = {},
): QuestionResponse {
  const state = options.state ?? "answered";
  return {
    questionId: question.id,
    questionVersion: question.version,
    state,
    own: state === "answered" ? own : [],
    accept,
    importance: options.importance ?? "medium",
    dealbreaker: options.dealbreaker ?? false,
    disclosure: options.disclosure ?? (question.intimate ? "private" : "summary"),
  };
}

function submission(
  depth: ChemistryDepth,
  responses: readonly QuestionResponse[],
  options: { intimacyShared?: boolean; hardSignal?: boolean; questionBankVersion?: string } = {},
): AssessmentSubmission {
  return {
    depth,
    manifestId: MANIFESTS[depth].id,
    questionBankVersion: options.questionBankVersion ?? CHEMISTRY_BANK_VERSION,
    responses,
    intimacyShared: options.intimacyShared ?? false,
    hardSignal: options.hardSignal ?? true,
  };
}

function questionsOf(depth: ChemistryDepth, dimension: (typeof DIMENSIONS)[number]["id"]) {
  return MANIFESTS[depth].questions.filter((question) => question.dimension === dimension);
}

function pair(
  depth: ChemistryDepth,
  first: readonly QuestionResponse[],
  second: readonly QuestionResponse[],
  options: { intimacyShared?: boolean; hardSignal?: boolean } = {},
) {
  return evaluateCompatibility(
    submission(depth, first, options),
    submission(depth, second, options),
  );
}

/** Mutual, fully shared answers for dimensions used only to reach report coverage. */
function filler(depth: ChemistryDepth) {
  const questions = [...questionsOf(depth, "lifestyle"), ...questionsOf(depth, "communication")];
  return questions.map((question) => response(question, [firstId(question, 0)], "any"));
}

function bandOf(evaluation: ReturnType<typeof pair>, dimension: (typeof DIMENSIONS)[number]["id"]) {
  return evaluation.dimensions.find((entry) => entry.dimension === dimension);
}

describe("question bank", () => {
  it("holds 100 unique, substantive questions with versioned manifests", () => {
    expect(MANIFESTS[100].questions).toHaveLength(100);
    const ids = MANIFESTS[100].questions.map((question) => question.id);
    expect(new Set(ids).size).toBe(100);
    expect(MANIFESTS[25].questions).toHaveLength(25);
    expect(MANIFESTS[50].questions).toHaveLength(50);
    for (const question of MANIFESTS[100].questions) {
      expect(question.version).toBe(CHEMISTRY_QUESTION_VERSION);
      expect(question.choices.length).toBeGreaterThanOrEqual(2);
      expect(new Set(question.choices.map((choice) => choice.id)).size).toBe(
        question.choices.length,
      );
      expect(question.prompt.length).toBeGreaterThan(10);
      expect(question.intimate).toBe(question.dimension === "intimacy");
      expect(question.prompt.toLowerCase()).not.toContain("diagnos");
    }
    expect(DIMENSIONS).toHaveLength(8);
    expect(MANIFESTS[25].id).not.toBe(MANIFESTS[50].id);
  });

  it("nests depths so 25 ⊂ 50 ⊂ 100 with the editorial dimension allocation", () => {
    const idsAt = (depth: ChemistryDepth) => new Set(MANIFESTS[depth].questions.map((q) => q.id));
    const small = idsAt(25);
    const medium = idsAt(50);
    const large = idsAt(100);
    for (const id of small) expect(medium.has(id)).toBe(true);
    for (const id of medium) expect(large.has(id)).toBe(true);
    const counts = (depth: ChemistryDepth) =>
      Object.fromEntries(
        DIMENSIONS.map((dimension) => [dimension.id, questionsOf(depth, dimension.id).length]),
      );
    expect(counts(25)).toEqual({
      goals: 4,
      lifestyle: 3,
      communication: 3,
      values: 3,
      affection: 3,
      intimacy: 3,
      adventure: 3,
      humor: 3,
    });
    expect(counts(50)).toEqual({
      goals: 7,
      lifestyle: 7,
      communication: 6,
      values: 6,
      affection: 6,
      intimacy: 6,
      adventure: 6,
      humor: 6,
    });
    expect(counts(100).goals).toBe(13);
    expect(counts(100).intimacy).toBe(12);
  });

  it("rejects unknown questions, wrong manifests, versions and invalid choices", () => {
    const goals = questionsOf(25, "goals");
    const question = goals[0] as ChemistryQuestion;
    const probing = questionsOf(50, "humor").find(
      (candidate) => !MANIFESTS[25].questions.some((entry) => entry.id === candidate.id),
    ) as ChemistryQuestion;
    const errors = validateSubmission(
      submission(25, [
        response(question, [firstId(question)], "any"),
        response(probing, [firstId(probing)], "any"),
        { ...response(question, [firstId(question)], "any"), questionVersion: 99 },
        { ...response(question, [firstId(question)], "any"), own: ["not-a-choice"] },
      ]),
    );
    expect(errors).toContain("question_not_in_manifest");
    expect(errors).toContain("duplicate_question");
    expect(errors).toContain("question_version_mismatch");
    expect(errors).toContain("invalid_own_choice");
    expect(
      validateSubmission(submission(25, [], { questionBankVersion: "chemistry-2020-01-01.v1" })),
    ).toContain("bank_version_mismatch");
  });
});

describe("acceptance-based alignment", () => {
  it("counts different answers as compatible when both accept them", () => {
    const goals = questionsOf(25, "goals");
    const first = goals.map((question) =>
      response(question, [firstId(question, 0)], [firstId(question, 0), firstId(question, 1)]),
    );
    const second = goals.map((question) =>
      response(question, [firstId(question, 1)], [firstId(question, 0), firstId(question, 1)]),
    );
    const evaluation = pair(25, first, second);
    expect(bandOf(evaluation, "goals")).toMatchObject({
      band: "largely_aligned",
      reason: "assessed",
      hasAcceptedDifferences: true,
    });
  });

  it("does not treat identical answers as compatible without acceptance", () => {
    const goals = questionsOf(25, "goals");
    const first = goals.map((question) =>
      response(question, [firstId(question, 0)], [firstId(question, 0)]),
    );
    const second = goals.map((question) =>
      response(question, [firstId(question, 0)], [firstId(question, 1)]),
    );
    const evaluation = pair(25, first, second);
    // A accepts B's identical answer; B's declared rule excludes it. min() is 0.
    expect(bandOf(evaluation, "goals")?.band).toBe("worth_discussing");
    expect(bandOf(evaluation, "goals")?.hasAcceptedDifferences).toBe(false);
  });

  it("never lets one satisfied direction carry the pair", () => {
    const goals = questionsOf(25, "goals");
    const first = goals.map((question) =>
      response(question, [firstId(question, 0)], "any", { importance: "high" }),
    );
    const second = goals.map((question) =>
      response(question, [firstId(question, 1)], [firstId(question, 1)], { importance: "high" }),
    );
    expect(bandOf(pair(25, first, second), "goals")?.band).toBe("worth_discussing");
  });

  it("keeps unset acceptance unknown instead of guessing 'same as me'", () => {
    const goals = questionsOf(25, "goals");
    const first = goals.map((question) => response(question, [firstId(question, 0)], null));
    const second = goals.map((question) => response(question, [firstId(question, 0)], "any"));
    const evaluation = pair(25, first, second);
    expect(bandOf(evaluation, "goals")).toMatchObject({
      band: null,
      reason: "no_shared_answers",
      comparable: 0,
    });
  });
});

describe("acceptance edge cases", () => {
  it("honours an explicit empty accepted set as 'nothing acceptable'", () => {
    const goals = questionsOf(25, "goals");
    const first = goals.map((question) => response(question, [firstId(question, 0)], []));
    const second = goals.map((question) =>
      response(question, [firstId(question, 0)], [firstId(question, 0)]),
    );
    expect(bandOf(pair(25, first, second), "goals")?.band).toBe("worth_discussing");
  });

  it("treats multi-select acceptance as subset semantics, not overlap", () => {
    const values = questionsOf(25, "values");
    const multi = values.find((question) => question.kind === "multi") as ChemistryQuestion;
    const others = values.filter((question) => question.id !== multi.id);
    const rest = others.map((question) =>
      response(question, [firstId(question, 0)], [firstId(question, 0)]),
    );
    // Every selected option must be accepted; a partial overlap is not enough.
    const broad = [response(multi, [firstId(multi, 0), firstId(multi, 1)], "any"), ...rest];
    const subset = [
      response(multi, [firstId(multi, 1)], [firstId(multi, 0), firstId(multi, 1)]),
      ...rest,
    ];
    const overlap = [response(multi, [firstId(multi, 1), firstId(multi, 2)], "any"), ...rest];
    const narrow = [response(multi, [firstId(multi, 0)], [firstId(multi, 0)]), ...rest];
    expect(bandOf(pair(25, broad, subset), "values")?.band).toBe("largely_aligned");
    expect(bandOf(pair(25, narrow, overlap), "values")?.band).not.toBe("largely_aligned");
  });

  it("applies declared weights without inventing partial credit", () => {
    const goals = questionsOf(25, "goals");
    const accepting = goals.map((question) =>
      response(question, [firstId(question, 0)], [firstId(question, 0)], {
        importance: "high",
      }),
    );
    const rejectingLow = goals.map((question, index) =>
      response(question, [firstId(question, 0)], index === 2 ? [firstId(question, 1)] : "any", {
        importance: index === 2 ? "low" : "high",
      }),
    );
    const rejectingHigh = goals.map((question, index) =>
      response(question, [firstId(question, 0)], index === 2 ? [firstId(question, 1)] : "any", {
        importance: "high",
      }),
    );
    expect(bandOf(pair(25, accepting, rejectingLow), "goals")?.band).toBe("largely_aligned");
    expect(bandOf(pair(25, accepting, rejectingHigh), "goals")?.band).toBe("some_differences");
  });

  it("reports no band when both directions carry zero weight", () => {
    const goals = questionsOf(25, "goals");
    const first = goals.map((question) =>
      response(question, [firstId(question, 0)], "any", { importance: "none" }),
    );
    expect(bandOf(pair(25, first, first), "goals")).toMatchObject({
      band: null,
      reason: "both_directions_not_weighted",
    });
  });

  it("ignores skipped, not-applicable and missing answers as unknown", () => {
    const goals = questionsOf(25, "goals");
    const first = goals.map((question, index) =>
      response(question, [firstId(question, 0)], "any", {
        state: index < 2 ? "answered" : "skipped",
      }),
    );
    const second = goals.map((question, index) =>
      response(question, [firstId(question, 0)], "any", {
        state: index < 3 ? "answered" : "not_applicable",
      }),
    );
    expect(bandOf(pair(25, first, second), "goals")).toMatchObject({
      band: null,
      reason: "not_enough_shared_answers",
      comparable: 2,
    });
  });

  it("does not count a private-only answered question as shared coverage", () => {
    const goals = questionsOf(25, "goals");
    const lifestyle = questionsOf(25, "lifestyle");
    const first = goals.map((question) =>
      response(question, [firstId(question, 0)], "any", { disclosure: "private" }),
    );
    const second = [...first];
    for (const question of lifestyle) {
      first.push(response(question, [firstId(question, 0)], "any", { disclosure: "private" }));
      second.push(response(question, [firstId(question, 0)], "any", { disclosure: "private" }));
    }
    const evaluation = pair(25, first, second);
    expect(bandOf(evaluation, "goals")?.reason).toBe("no_shared_answers");
    expect(bandOf(evaluation, "lifestyle")?.reason).toBe("no_shared_answers");
    expect(evaluation.coverage).toBe("insufficient");
  });
});

describe("hard requirements", () => {
  it("keeps a hard conflict visible beside high soft alignment", () => {
    const goals = questionsOf(25, "goals");
    const first = goals.map((question) =>
      response(question, [firstId(question, 0)], "any", { importance: "high" }),
    );
    const second = goals.map((question, index) =>
      index === 3
        ? response(question, [firstId(question, 0)], [firstId(question, 1)], {
            importance: "low",
            dealbreaker: true,
          })
        : response(question, [firstId(question, 0)], "any", { importance: "high" }),
    );
    const evaluation = pair(25, [...first, ...filler(25)], [...second, ...filler(25)]);
    expect(bandOf(evaluation, "goals")?.band).toBe("largely_aligned");
    expect(evaluation.hardConflict).toBe("conflict_detected");
    const report = buildSharedReport(evaluation);
    expect(report.hardConflict).toBe("conflict_detected");
    // The report names no owner, rule, question or count.
    expect(JSON.stringify(report)).not.toContain("dealbreaker");
  });

  it("reports unknown information rather than 'all clear'", () => {
    const goals = questionsOf(25, "goals");
    const first = goals.map((question, index) =>
      response(question, [firstId(question, 0)], "any", { dealbreaker: index === 0 }),
    );
    const second = goals.map((question, index) =>
      response(question, [firstId(question, 0)], "any", {
        state: index === 0 ? "skipped" : "answered",
      }),
    );
    const evaluation = pair(25, [...first, ...filler(25)], [...second, ...filler(25)]);
    expect(evaluation.hardConflict).toBe("insufficient_information");
    expect(buildSharedReport(evaluation).hardConflict).toBe("insufficient_information");
  });

  it("confirms no conflict only when every included hard check is evaluable", () => {
    const goals = questionsOf(25, "goals");
    const first = goals.map((question) =>
      response(question, [firstId(question, 0)], "any", { dealbreaker: true }),
    );
    const second = goals.map((question) =>
      response(question, [firstId(question, 1)], [firstId(question, 0), firstId(question, 1)]),
    );
    expect(pair(25, first, second).hardConflict).toBe("none_detected_in_evaluated_scope");
  });

  it("suppresses the joint signal unless both participants approve it", () => {
    const goals = questionsOf(25, "goals");
    const first = goals.map((question) =>
      response(question, [firstId(question, 0)], [firstId(question, 1)], { dealbreaker: true }),
    );
    const second = goals.map((question) => response(question, [firstId(question, 0)], "any"));
    const evaluation = evaluateCompatibility(
      submission(25, first, { hardSignal: true }),
      submission(25, second, { hardSignal: false }),
    );
    expect(evaluation.hardConflict).toBe("conflict_detected");
    expect(evaluation.hardSignalAuthorized).toBe(false);
    expect(buildSharedReport(evaluation).hardConflict).toBeNull();
  });

  it("lets a private-only hard rule affect nothing partner-visible", () => {
    const goals = questionsOf(25, "goals");
    const first = goals.map((question) => response(question, [firstId(question, 0)], "any"));
    // This rule would be a conflict if it were shared. Private-only, it must vanish.
    const privateRule = goals.map((question, index) =>
      index === 0
        ? response(question, [firstId(question, 1)], [], {
            dealbreaker: true,
            disclosure: "private",
          })
        : response(question, [firstId(question, 1)], [firstId(question, 0), firstId(question, 1)]),
    );
    const withoutRule = goals.map((question, index) =>
      index === 0
        ? response(question, [firstId(question, 1)], "any", { state: "skipped" })
        : response(question, [firstId(question, 1)], [firstId(question, 0), firstId(question, 1)]),
    );
    const hidden = buildSharedReport(
      pair(25, [...first, ...filler(25)], [...privateRule, ...filler(25)], { hardSignal: true }),
    );
    const omitted = buildSharedReport(
      pair(25, [...first, ...filler(25)], [...withoutRule, ...filler(25)], { hardSignal: true }),
    );
    expect(hidden.hardConflict).not.toBe("conflict_detected");
    expect(JSON.stringify(hidden)).toBe(JSON.stringify(omitted));
  });
});

describe("privacy and disclosure", () => {
  it("is invariant to private answer content, weights and hard rules", () => {
    const questions = [...questionsOf(25, "goals"), ...questionsOf(25, "lifestyle")];
    const first = questions.map((question) => response(question, [firstId(question, 0)], "any"));
    const second = questions.map((question) =>
      response(question, [firstId(question, 1)], [firstId(question, 0), firstId(question, 1)]),
    );
    const baseline = buildSharedReport(pair(25, first, second, { hardSignal: true }));
    const tamperedSecond = questions.map((question, index) =>
      index === 0
        ? response(question, [firstId(question, 3)], [firstId(question, 2)], {
            importance: "none",
            dealbreaker: true,
            disclosure: "private",
          })
        : response(question, [firstId(question, 1)], [firstId(question, 0), firstId(question, 1)]),
    );
    const tampered = buildSharedReport(pair(25, first, tamperedSecond, { hardSignal: true }));
    expect(JSON.stringify(tampered)).toBe(JSON.stringify(baseline));
  });

  it("never raises coverage by adding private-only answers", () => {
    const goals = questionsOf(25, "goals");
    const first = goals.map((question) => response(question, [firstId(question, 0)], "any"));
    const second = goals.map((question) => response(question, [firstId(question, 0)], "any"));
    const before = buildSharedReport(pair(25, first, second));
    const noisyFirst = [...first];
    const noisySecond = [...second];
    for (const question of questionsOf(25, "lifestyle")) {
      noisyFirst.push(response(question, [firstId(question, 0)], "any", { disclosure: "private" }));
      noisySecond.push(
        response(question, [firstId(question, 0)], "any", { disclosure: "private" }),
      );
    }
    expect(JSON.stringify(buildSharedReport(pair(25, noisyFirst, noisySecond)))).toBe(
      JSON.stringify(before),
    );
    expect(before.available).toBe(false);
  });

  it("keeps intimacy unassessed by default and requires five mutual items", () => {
    const intimacyAt25 = questionsOf(25, "intimacy");
    const shared = intimacyAt25.map((question) =>
      response(question, [firstId(question, 0)], "any", { disclosure: "summary" }),
    );
    expect(bandOf(pair(25, shared, shared), "intimacy")).toMatchObject({
      band: null,
      reason: "intimacy_not_mutually_shared",
    });
    expect(bandOf(pair(25, shared, shared, { intimacyShared: true }), "intimacy")?.reason).toBe(
      "not_enough_shared_answers",
    );
    const intimacyAt50 = questionsOf(50, "intimacy");
    const full = intimacyAt50.map((question) =>
      response(question, [firstId(question, 0)], "any", { disclosure: "summary" }),
    );
    expect(bandOf(pair(50, full, full, { intimacyShared: true }), "intimacy")?.band).toBe(
      "largely_aligned",
    );
  });

  it("excludes responses built for a different question version", () => {
    const goals = questionsOf(25, "goals");
    const first = goals.map((question) => response(question, [firstId(question, 0)], "any"));
    const second = goals.map((question, index) =>
      index === 0
        ? { ...response(question, [firstId(question, 0)], "any"), questionVersion: 2 }
        : response(question, [firstId(question, 0)], "any"),
    );
    const evaluation = pair(25, first, second);
    expect(bandOf(evaluation, "goals")).toMatchObject({ band: "largely_aligned", comparable: 3 });
    expect(validateSubmission(submission(25, second))).toContain("question_version_mismatch");
  });
});

describe("shared report", () => {
  it("withholds bands and starters when coverage is insufficient", () => {
    const goals = questionsOf(25, "goals");
    const first = goals.map((question) => response(question, [firstId(question, 0)], "any"));
    const report = buildSharedReport(pair(25, first, first));
    expect(report.available).toBe(false);
    expect(report.conversationStarters).toEqual([]);
    expect(report.dimensions.every((dimension) => dimension.band === null)).toBe(true);
    expect(report.dimensions.every((dimension) => dimension.detail === "report_withheld")).toBe(
      true,
    );
    expect(report.disclosures.join(" ")).toContain("cannot predict");
  });

  it("lists coarse sections without raw answers, counts or directional values", () => {
    const questions = [
      ...questionsOf(25, "goals"),
      ...questionsOf(25, "humor"),
      ...questionsOf(25, "communication"),
    ];
    const first = questions.map((question) => response(question, [firstId(question, 0)], "any"));
    const second = questions.map((question) =>
      response(question, [firstId(question, 1)], [firstId(question, 0), firstId(question, 1)]),
    );
    const report = buildSharedReport(pair(25, first, second));
    expect(report.available).toBe(true);
    expect(report.strongAlignment).toContain("goals");
    expect(report.mutuallyAcceptableDifferences).toContain("goals");
    expect(report.conversationStarters.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(report);
    for (const leaked of ["comparable", "hasAcceptedDifferences", "alignment_"]) {
      expect(serialized).not.toContain(leaked);
    }
    for (const question of questions) {
      const ownLabel = question.choices[0]?.label;
      if (ownLabel) expect(serialized).not.toContain(ownLabel);
      expect(serialized).not.toContain(question.prompt);
    }
  });

  it("keeps a withheld hard signal indistinguishable from an unassessed one", () => {
    const goals = questionsOf(25, "goals");
    const first = goals.map((question) =>
      response(question, [firstId(question, 0)], [firstId(question, 1)], { dealbreaker: true }),
    );
    const second = goals.map((question) => response(question, [firstId(question, 0)], "any"));
    const withheld = buildSharedReport(
      evaluateCompatibility(
        submission(25, first, { hardSignal: false }),
        submission(25, second, { hardSignal: false }),
      ),
    );
    expect(withheld.hardConflict).toBeNull();
    expect(JSON.stringify(withheld)).not.toContain("conflict_detected");
  });
});

describe("demonstration pairing", () => {
  const sample = (depth: ChemistryDepth) => {
    const report = buildSharedReport(
      evaluateCompatibility(
        syntheticSubmission(depth, "chemistry-demo-visitor-2026-11"),
        syntheticSubmission(depth, "chemistry-demo-partner-2026-11"),
      ),
    );
    return report;
  };

  it("produces an available, varied and coarse report at every depth", () => {
    for (const depth of [25, 50, 100] as const) {
      const report = sample(depth);
      expect(report.available).toBe(true);
      const assessed = report.dimensions.filter((dimension) => dimension.band !== null);
      expect(assessed.length).toBeGreaterThanOrEqual(depth === 25 ? 4 : 6);
      expect(report.conversationStarters.length).toBeGreaterThan(0);
      expect(report.dimensions.find((entry) => entry.dimension === "intimacy")?.band).toBeNull();
      expect([
        "conflict_detected",
        "none_detected_in_evaluated_scope",
        "insufficient_information",
      ]).toContain(report.hardConflict);
      expect(JSON.stringify(report)).not.toContain("prompt");
    }
  });

  it("keeps demonstration data deterministic and depth-specific", () => {
    const first = sample(25);
    const again = sample(25);
    expect(JSON.stringify(again)).toBe(JSON.stringify(first));
    expect(sample(100).manifestId).not.toBe(first.manifestId);
    expect(sample(100).dimensions.length).toBe(8);
  });
});
