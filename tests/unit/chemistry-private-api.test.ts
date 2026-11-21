import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backup } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restoreQuarantineSql } from "../../scripts/restore-quarantine";
import { type ChemistryDepth, DIMENSIONS, MANIFESTS } from "../../src/content/chemistry/questions";
import type { AssessmentSubmission } from "../../src/domain/chemistry";
import { app } from "../../src/server";
import type { Bindings } from "../../src/server/bindings";
import { createTestDatabase, openTestSnapshot, type TestDatabase } from "../support/d1";

const ORIGIN = "http://127.0.0.1:8787";
let database: TestDatabase;
let env: Bindings;
let delivered: { email: string; otp: string }[];
let counter = 0;

function chemistryEnv(): Bindings {
  const value = crypto.getRandomValues(new Uint8Array(32));
  return {
    DB: database.db,
    APP_ENV: "local",
    ASSETS: undefined as unknown as Fetcher,
    BETTER_AUTH_SECRET: "chemistry-api-tests-strong-secret-32-characters",
    AUTH_TEST_DELIVER: async (data: { email: string; otp: string }) => delivered.push(data),
    CHEMISTRY_PRIVATE_ENABLED: "true",
    CHEMISTRY_ENVELOPE_KEY: Buffer.from(value).toString("base64url"),
  } as unknown as Bindings;
}

function accountCall(path: string, body?: unknown, cookie = "") {
  return app.request(
    `${ORIGIN}${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "x-cheapseggs-action": "account",
        cookie,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  );
}

async function login(email?: string): Promise<{ cookie: string; userId: string }> {
  counter += 1;
  const address = email ?? `person-${counter}@example.com`;
  const sent = await accountCall("/api/auth/email-otp/send-verification-otp", {
    email: address,
    adult: true,
  });
  expect(sent.status).toBe(200);
  const code = delivered.at(-1)?.otp;
  const signed = await accountCall("/api/auth/sign-in/email-otp", {
    email: address,
    otp: code,
    adult: true,
  });
  expect(signed.status).toBe(200);
  const cookie = signed.headers.get("set-cookie")?.split(";")[0] ?? "";
  const row = database.raw
    .prepare("SELECT id FROM users WHERE auth_subject = (SELECT id FROM auth_user WHERE email = ?)")
    .get(address) as { id: string } | undefined;
  expect(row?.id).toBeTruthy();
  return { cookie, userId: row?.id ?? "" };
}

function api(
  path: string,
  options: { cookie?: string; method?: string; body?: unknown; origin?: string } = {},
) {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  return app.request(
    `${ORIGIN}${path}`,
    {
      method,
      headers: {
        origin: options.origin ?? ORIGIN,
        "content-type": "application/json",
        "x-cheapseggs-action": "chemistry",
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    },
    env,
  );
}

function submission(depth: ChemistryDepth = 25, overrides: Partial<AssessmentSubmission> = {}) {
  return {
    depth,
    manifestId: MANIFESTS[depth].id,
    questionBankVersion: "chemistry-2026-11-19.v1",
    responses: MANIFESTS[depth].questions.map((question) => ({
      questionId: question.id,
      questionVersion: question.version,
      state: "answered" as const,
      own: [question.choices[0]?.id ?? ""],
      accept: [question.choices[0]?.id ?? ""],
      importance: "medium" as const,
      dealbreaker: false,
      disclosure: "summary" as const,
    })),
    intimacyShared: false,
    hardSignal: true,
    ...overrides,
  };
}

beforeEach(() => {
  database = createTestDatabase();
  delivered = [];
  counter = 0;
  env = chemistryEnv();
});
afterEach(() => {
  vi.restoreAllMocks();
  database.raw.close();
});

async function createPair(depth: ChemistryDepth = 25) {
  const first = await login();
  const second = await login();
  const created = await api("/api/v1/chemistry-check/assessments", {
    cookie: first.cookie,
    body: { depth, inviteeLabel: "Sam" },
  });
  expect(created.status).toBe(201);
  const payload = (await created.json()) as {
    assessment: { id: string };
    invitation: { token: string };
  };
  const accepted = await api("/api/v1/chemistry-check/invitations/accept", {
    cookie: second.cookie,
    body: { token: payload.invitation.token, confirmLabel: "Sam" },
  });
  expect(accepted.status).toBe(200);
  return {
    first,
    second,
    assessmentId: payload.assessment.id,
    token: payload.invitation.token,
  };
}

describe("independent invitations", () => {
  it("binds two authenticated accounts, rejects self/replay/third claims and never creates a couple", async () => {
    const first = await login();
    const second = await login();
    const third = await login();
    const created = await api("/api/v1/chemistry-check/assessments", {
      cookie: first.cookie,
      body: { depth: 25, inviteeLabel: "Sam" },
    });
    expect(created.status).toBe(201);
    const payload = (await created.json()) as {
      assessment: { id: string; status: string };
      invitation: { token: string; hashPath: string };
    };
    expect(payload.assessment.status).toBe("invited");
    expect(payload.invitation.hashPath).toContain("#invite=");

    expect(
      (
        await api("/api/v1/chemistry-check/invitations/accept", {
          cookie: first.cookie,
          body: { token: payload.invitation.token, confirmLabel: "Sam" },
        })
      ).status,
    ).toBe(404);

    expect(
      (
        await api("/api/v1/chemistry-check/invitations/accept", {
          cookie: second.cookie,
          body: { token: payload.invitation.token, confirmLabel: "Alex" },
        })
      ).status,
    ).toBe(404);

    const accepted = await api("/api/v1/chemistry-check/invitations/accept", {
      cookie: second.cookie,
      body: { token: payload.invitation.token, confirmLabel: "Sam" },
    });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ assessmentId: payload.assessment.id });

    expect(
      (
        await api("/api/v1/chemistry-check/invitations/accept", {
          cookie: second.cookie,
          body: { token: payload.invitation.token, confirmLabel: "Sam" },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api("/api/v1/chemistry-check/invitations/accept", {
          cookie: third.cookie,
          body: { token: payload.invitation.token, confirmLabel: "Sam" },
        })
      ).status,
    ).toBe(404);

    const participants = database.raw
      .prepare("SELECT count(*) AS total FROM chemistry_participants WHERE assessment_id = ?")
      .get(payload.assessment.id) as { total: number };
    expect(participants.total).toBe(2);
    expect(database.raw.prepare("SELECT count(*) AS total FROM couples").get()).toEqual({
      total: 0,
    });
    expect(database.raw.prepare("SELECT count(*) AS total FROM memberships").get()).toEqual({
      total: 0,
    });

    const serialized = JSON.stringify(
      database.raw.prepare("SELECT token_digest FROM chemistry_invitations").all(),
    );
    expect(serialized).not.toContain(payload.invitation.token);
    expect(serialized).toMatch(/[0-9a-f]{64}/);

    for (const viewer of [first, second]) {
      const view = await api(`/api/v1/chemistry-check/assessments/${payload.assessment.id}`, {
        cookie: viewer.cookie,
      });
      expect(view.status).toBe(200);
      expect(JSON.stringify(await view.json())).not.toMatch(/counterpart|partner|progress/);
    }
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${payload.assessment.id}`, {
          cookie: third.cookie,
        })
      ).status,
    ).toBe(404);

    const duplicate = await api("/api/v1/chemistry-check/assessments", {
      cookie: first.cookie,
      body: { depth: 50, inviteeLabel: "Sam" },
    });
    expect(duplicate.status).toBe(201);
    const duplicatePayload = (await duplicate.json()) as { invitation: { token: string } };
    expect(
      (
        await api("/api/v1/chemistry-check/invitations/accept", {
          cookie: second.cookie,
          body: { token: duplicatePayload.invitation.token, confirmLabel: "Sam" },
        })
      ).status,
    ).toBe(404);
  });
});

describe("invitation failure modes", () => {
  it("expires, revokes and declines with the same generic response", async () => {
    const first = await login();
    const second = await login();
    const expired = await api("/api/v1/chemistry-check/assessments", {
      cookie: first.cookie,
      body: { depth: 25, inviteeLabel: "Sam" },
    });
    const expiredPayload = (await expired.json()) as {
      assessment: { id: string };
      invitation: { token: string };
    };
    database.raw
      .prepare(
        "UPDATE chemistry_invitations SET created_at = 1, expires_at = 2 WHERE assessment_id = ?",
      )
      .run(expiredPayload.assessment.id);
    const late = await api("/api/v1/chemistry-check/invitations/accept", {
      cookie: second.cookie,
      body: { token: expiredPayload.invitation.token, confirmLabel: "Sam" },
    });
    expect(late.status).toBe(404);
    expect(await late.json()).toEqual({ error: "not_found" });

    const revocable = await api("/api/v1/chemistry-check/assessments", {
      cookie: first.cookie,
      body: { depth: 25, inviteeLabel: "Sam" },
    });
    const revocablePayload = (await revocable.json()) as {
      assessment: { id: string };
      invitation: { token: string };
    };
    expect(
      (
        await api(
          `/api/v1/chemistry-check/assessments/${revocablePayload.assessment.id}/invitation/revoke`,
          { cookie: first.cookie, method: "POST" },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await api("/api/v1/chemistry-check/invitations/accept", {
          cookie: second.cookie,
          body: { token: revocablePayload.invitation.token, confirmLabel: "Sam" },
        })
      ).status,
    ).toBe(404);

    const pair = await createPair();
    const declined = await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/decline`, {
      cookie: pair.second.cookie,
      method: "POST",
    });
    expect(declined.status).toBe(200);
    expect(
      database.raw
        .prepare("SELECT status FROM chemistry_assessments WHERE id = ?")
        .get(pair.assessmentId),
    ).toEqual({ status: "declined" });
    expect(
      database.raw
        .prepare(
          "SELECT count(*) AS total FROM chemistry_participants WHERE assessment_id = ? AND (submission_envelope IS NOT NULL OR draft_envelope IS NOT NULL)",
        )
        .get(pair.assessmentId),
    ).toEqual({ total: 0 });
  });

  it("admits exactly one of two concurrent claims", async () => {
    const first = await login();
    const second = await login();
    const third = await login();
    const created = await api("/api/v1/chemistry-check/assessments", {
      cookie: first.cookie,
      body: { depth: 25, inviteeLabel: "Sam" },
    });
    const payload = (await created.json()) as {
      assessment: { id: string };
      invitation: { token: string };
    };
    const attempts = await Promise.all(
      [second, third].map((candidate) =>
        api("/api/v1/chemistry-check/invitations/accept", {
          cookie: candidate.cookie,
          body: { token: payload.invitation.token, confirmLabel: "Sam" },
        }),
      ),
    );
    expect(attempts.map((response) => response.status).sort()).toEqual([200, 404]);
    expect(
      database.raw
        .prepare("SELECT count(*) AS total FROM chemistry_participants WHERE assessment_id = ?")
        .get(payload.assessment.id),
    ).toEqual({ total: 2 });
  });
});

describe("private drafts and immutable submissions", () => {
  it("scopes drafts to their owner and rejects malformed or cross-depth payloads", async () => {
    const pair = await createPair();
    const third = await login();
    const draft = submission(25);
    const saved = await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/draft`, {
      cookie: pair.first.cookie,
      method: "PUT",
      body: { submission: draft },
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ revision: 1 });

    const own = await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/draft`, {
      cookie: pair.first.cookie,
    });
    expect(own.status).toBe(200);
    expect(((await own.json()) as { submission: AssessmentSubmission }).submission).toEqual(draft);

    for (const outsider of [pair.second, third]) {
      expect(
        (
          await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/draft`, {
            cookie: outsider.cookie,
          })
        ).status,
      ).toBe(404);
    }

    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/draft`, {
          cookie: pair.first.cookie,
          method: "PUT",
          body: { submission: submission(50) },
        })
      ).status,
    ).toBe(404);
    const probing = submission(25, {
      responses: [
        ...submission(25).responses,
        {
          questionId: "flirting",
          questionVersion: 1,
          state: "answered" as const,
          own: ["art"],
          accept: "any" as const,
          importance: "medium" as const,
          dealbreaker: false,
          disclosure: "summary" as const,
        },
      ],
    });
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/draft`, {
          cookie: pair.first.cookie,
          method: "PUT",
          body: { submission: probing },
        })
      ).status,
    ).toBe(400);
  });

  it("stores only encrypted submissions and advances revisions atomically", async () => {
    const pair = await createPair();
    const firstSaved = await api(
      `/api/v1/chemistry-check/assessments/${pair.assessmentId}/submission`,
      { cookie: pair.first.cookie, method: "POST", body: { submission: submission(25) } },
    );
    expect(firstSaved.status).toBe(200);
    expect(((await firstSaved.json()) as { revision: number }).revision).toBe(1);
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/submission`, {
          cookie: pair.second.cookie,
          method: "POST",
          body: { submission: submission(25) },
        })
      ).status,
    ).toBe(200);
    expect(
      database.raw
        .prepare("SELECT status FROM chemistry_assessments WHERE id = ?")
        .get(pair.assessmentId),
    ).toEqual({ status: "awaiting_release" });

    const rows = database.raw
      .prepare(
        "SELECT submission_envelope, submission_key_version, submission_digest, submission_revision FROM chemistry_participants WHERE assessment_id = ?",
      )
      .all(pair.assessmentId) as {
      submission_envelope: string;
      submission_key_version: number;
      submission_digest: string;
      submission_revision: number;
    }[];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.submission_envelope).toMatch(/^\{/);
      expect(row.submission_key_version).toBe(1);
      expect(row.submission_digest).toMatch(/^[0-9a-f]{64}$/);
      expect(row.submission_revision).toBe(1);
    }
    const dump = JSON.stringify(database.raw.prepare("SELECT * FROM chemistry_participants").all());
    expect(dump).not.toContain("This week, ideally");
    expect(dump).not.toContain("Couch and snacks");
    expect(dump).not.toContain("questionId");

    const resubmitted = await api(
      `/api/v1/chemistry-check/assessments/${pair.assessmentId}/submission`,
      {
        cookie: pair.first.cookie,
        method: "POST",
        body: { submission: submission(25, { hardSignal: false }) },
      },
    );
    expect(resubmitted.status).toBe(200);
    expect(((await resubmitted.json()) as { revision: number }).revision).toBe(2);
    expect(
      database.raw
        .prepare("SELECT result_epoch FROM chemistry_assessments WHERE id = ?")
        .get(pair.assessmentId),
    ).toEqual({ result_epoch: 4 });
  });
});

const ALL_DIMENSIONS = DIMENSIONS.map((dimension) => dimension.id);

async function submitBoth(
  pair: Awaited<ReturnType<typeof createPair>>,
  first = submission(25),
  second = submission(25),
) {
  for (const [member, body] of [
    [pair.first, first],
    [pair.second, second],
  ] as const) {
    const response = await api(
      `/api/v1/chemistry-check/assessments/${pair.assessmentId}/submission`,
      { cookie: member.cookie, method: "POST", body: { submission: body } },
    );
    expect(response.status).toBe(200);
  }
}

async function approve(
  pair: Awaited<ReturnType<typeof createPair>>,
  member: "first" | "second",
  scope: { dimensions?: string[]; intimacyShared?: boolean; hardSignal?: boolean } = {},
) {
  return api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/approval`, {
    cookie: pair[member].cookie,
    method: "POST",
    body: {
      dimensions: scope.dimensions ?? ALL_DIMENSIONS,
      intimacyShared: scope.intimacyShared ?? false,
      hardSignal: scope.hardSignal ?? true,
    },
  });
}

async function release(pair: Awaited<ReturnType<typeof createPair>>) {
  return api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/release`, {
    cookie: pair.first.cookie,
    method: "POST",
  });
}

describe("mutual release and reports", () => {
  it("refuses one-sided release and returns the same coarse report to both", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    expect((await approve(pair, "first")).status).toBe(200);
    expect((await release(pair)).status).toBe(409);
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`, {
          cookie: pair.second.cookie,
        })
      ).status,
    ).toBe(404);

    expect((await approve(pair, "second")).status).toBe(200);
    const released = await release(pair);
    expect(released.status).toBe(200);
    const firstReport = await api(
      `/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`,
      { cookie: pair.first.cookie },
    );
    const secondReport = await api(
      `/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`,
      { cookie: pair.second.cookie },
    );
    expect(firstReport.status).toBe(200);
    expect(secondReport.status).toBe(200);
    const firstBody = await firstReport.json();
    const secondBody = await secondReport.json();
    expect(secondBody).toEqual(firstBody);
    const payload = secondBody as {
      report: { available: boolean; dimensions: { dimension: string; band: string | null }[] };
      expiresAt: number;
    };
    expect(payload.report.available).toBe(true);
    expect(payload.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    const serialized = JSON.stringify(payload);
    for (const leaked of ["comparable", "questionId", "importance", "hasAcceptedDifferences"])
      expect(serialized).not.toContain(leaked);
    expect(serialized).not.toContain("This week, ideally");
    const stored = JSON.stringify(database.raw.prepare("SELECT * FROM chemistry_results").all());
    expect(stored).not.toContain("largely_aligned");
    expect(stored).toContain("AES-GCM");
  });
});

describe("release scope and invalidation", () => {
  it("intersects dimensions and suppresses one-sided flags without blocking release", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    expect(
      (
        await approve(pair, "first", {
          dimensions: ["goals", "lifestyle", "communication", "intimacy"],
          intimacyShared: false,
          hardSignal: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await approve(pair, "second", {
          dimensions: ["goals", "lifestyle", "communication", "humor"],
          intimacyShared: false,
          hardSignal: false,
        })
      ).status,
    ).toBe(200);
    expect((await release(pair)).status).toBe(200);
    const response = await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`, {
      cookie: pair.first.cookie,
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      report: {
        hardConflict: string | null;
        dimensions: { dimension: string; band: string | null; detail: string }[];
      };
    };
    expect(payload.report.hardConflict).toBeNull();
    const byId = new Map(payload.report.dimensions.map((entry) => [entry.dimension, entry]));
    expect(byId.get("goals")?.band).not.toBeNull();
    expect(byId.get("humor")?.detail).toBe("not_enough_shared_answers");
    expect(byId.get("intimacy")?.detail).toBe("not_enough_shared_answers");
  });

  it("invalidates both approvals when one participant edits their submission", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    await approve(pair, "first");
    await approve(pair, "second");
    const edited = await api(
      `/api/v1/chemistry-check/assessments/${pair.assessmentId}/submission`,
      {
        cookie: pair.first.cookie,
        method: "POST",
        body: { submission: submission(25, { hardSignal: false }) },
      },
    );
    expect(edited.status).toBe(200);
    expect(
      database.raw.prepare("SELECT count(*) AS total FROM chemistry_release_approvals").get(),
    ).toEqual({ total: 0 });
    expect((await release(pair)).status).toBe(409);
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`, {
          cookie: pair.second.cookie,
        })
      ).status,
    ).toBe(404);
    await approve(pair, "first");
    await approve(pair, "second");
    expect((await release(pair)).status).toBe(200);
  });

  it("rejects a tampered approval digest and revoked sessions", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    await approve(pair, "first");
    await approve(pair, "second");
    database.raw
      .prepare("UPDATE chemistry_release_approvals SET scope_digest = ? WHERE user_id = ?")
      .run("0".repeat(64), pair.first.userId);
    expect((await release(pair)).status).toBe(409);
    const revoked = await accountCall("/api/account/revoke", { all: true }, pair.first.cookie);
    expect(revoked.status).toBe(200);
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}`, {
          cookie: pair.first.cookie,
        })
      ).status,
    ).toBe(401);
  });
});

function patchResponse(
  base: AssessmentSubmission,
  index: number,
  patch: Partial<AssessmentSubmission["responses"][number]>,
): AssessmentSubmission {
  return {
    ...base,
    responses: base.responses.map((response, position) =>
      position === index ? { ...response, ...patch } : response,
    ),
  };
}

describe("hard requirements and disclosure noninterference", () => {
  it("surfaces a conflict without identifying the owner or the rule", async () => {
    const pair = await createPair();
    const question = MANIFESTS[25].questions[0];
    if (!question) throw new Error("missing question");
    const strict = patchResponse(submission(25), 0, {
      own: [question.choices[0]?.id ?? ""],
      accept: [question.choices[1]?.id ?? ""],
      dealbreaker: true,
    });
    await submitBoth(pair, strict, submission(25));
    await approve(pair, "first", { hardSignal: true });
    await approve(pair, "second", { hardSignal: true });
    expect((await release(pair)).status).toBe(200);
    const response = await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`, {
      cookie: pair.second.cookie,
    });
    const payload = (await response.json()) as { report: { hardConflict: string | null } };
    expect(payload.report.hardConflict).toBe("conflict_detected");
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("dealbreaker");
    expect(serialized).not.toContain(pair.first.userId);
    expect(serialized).not.toContain(pair.second.userId);
  });

  it("does not let private-only answers change a released report", async () => {
    const question = MANIFESTS[25].questions[0];
    if (!question) throw new Error("missing question");
    const firstAnswer = question.choices[0]?.id ?? "";
    const otherAnswer = question.choices[3]?.id ?? "";
    const variant = (own: string) =>
      patchResponse(submission(25), 0, { own: [own], disclosure: "private" });

    const pairA = await createPair();
    await submitBoth(pairA, variant(firstAnswer), variant(firstAnswer));
    await approve(pairA, "first");
    await approve(pairA, "second");
    expect((await release(pairA)).status).toBe(200);
    const reportA = await api(`/api/v1/chemistry-check/assessments/${pairA.assessmentId}/report`, {
      cookie: pairA.first.cookie,
    });
    const baseline = await reportA.json();

    const pairB = await createPair();
    await submitBoth(pairB, variant(otherAnswer), variant(otherAnswer));
    await approve(pairB, "first");
    await approve(pairB, "second");
    expect((await release(pairB)).status).toBe(200);
    const reportB = await api(`/api/v1/chemistry-check/assessments/${pairB.assessmentId}/report`, {
      cookie: pairB.second.cookie,
    });
    expect(await reportB.json()).toEqual(baseline);
    const serialized = JSON.stringify(baseline);
    expect(serialized).not.toContain(question.choices[0]?.label ?? "");
    expect(serialized).not.toContain(question.choices[3]?.label ?? "");
  });
});

describe("withdrawal, deletion and expiry", () => {
  it("revokes access immediately when either participant withdraws", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    await approve(pair, "first");
    await approve(pair, "second");
    expect((await release(pair)).status).toBe(200);
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/withdraw`, {
          cookie: pair.second.cookie,
          method: "POST",
        })
      ).status,
    ).toBe(200);
    for (const member of [pair.first, pair.second])
      expect(
        (
          await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`, {
            cookie: member.cookie,
          })
        ).status,
      ).toBe(404);
    expect(database.raw.prepare("SELECT count(*) AS n FROM chemistry_results").get()).toEqual({
      n: 0,
    });
    expect(
      database.raw
        .prepare(
          "SELECT count(*) AS n FROM chemistry_participants WHERE submission_envelope IS NOT NULL",
        )
        .get(),
    ).toEqual({ n: 0 });
  });

  it("terminates a released assessment when an account is deleted", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    await approve(pair, "first");
    await approve(pair, "second");
    expect((await release(pair)).status).toBe(200);
    const deleted = await accountCall(
      "/api/account/delete",
      { confirmation: "DELETE" },
      pair.second.cookie,
    );
    expect(deleted.status).toBe(200);
    expect(
      database.raw
        .prepare("SELECT count(*) AS n FROM chemistry_assessments WHERE id = ?")
        .get(pair.assessmentId),
    ).toEqual({ n: 0 });
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`, {
          cookie: pair.first.cookie,
        })
      ).status,
    ).toBe(404);
  });
});

describe("expiration, cooldown and abuse limits", () => {
  it("expires assessments and reports and clears private envelopes", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    await approve(pair, "first");
    await approve(pair, "second");
    database.raw
      .prepare(
        "UPDATE chemistry_assessments SET created_at = 1, assessment_expires_at = 2 WHERE id = ?",
      )
      .run(pair.assessmentId);
    const view = await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}`, {
      cookie: pair.first.cookie,
    });
    expect(view.status).toBe(200);
    expect(((await view.json()) as { assessment: { status: string } }).assessment.status).toBe(
      "closed",
    );
    expect(
      database.raw
        .prepare("SELECT status FROM chemistry_assessments WHERE id = ?")
        .get(pair.assessmentId),
    ).toEqual({ status: "expired" });
    expect(
      database.raw
        .prepare(
          "SELECT count(*) AS n FROM chemistry_participants WHERE submission_envelope IS NOT NULL",
        )
        .get(),
    ).toEqual({ n: 0 });
    expect((await release(pair)).status).toBe(409);

    const reportPair = await createPair();
    await submitBoth(reportPair);
    await approve(reportPair, "first");
    await approve(reportPair, "second");
    expect((await release(reportPair)).status).toBe(200);
    database.raw
      .prepare(
        "UPDATE chemistry_assessments SET released_at = 1, report_expires_at = 2 WHERE id = ?",
      )
      .run(reportPair.assessmentId);
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${reportPair.assessmentId}/report`, {
          cookie: reportPair.second.cookie,
        })
      ).status,
    ).toBe(404);
    expect(
      database.raw
        .prepare("SELECT status FROM chemistry_assessments WHERE id = ?")
        .get(reportPair.assessmentId),
    ).toEqual({ status: "expired" });
  });

  it("enforces the 30-day pair cooldown even after local deletion", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    await approve(pair, "first");
    await approve(pair, "second");
    expect((await release(pair)).status).toBe(200);

    const again = await api("/api/v1/chemistry-check/assessments", {
      cookie: pair.first.cookie,
      body: { depth: 25, inviteeLabel: "Sam" },
    });
    expect(again.status).toBe(201);
    const token = ((await again.json()) as { invitation: { token: string } }).invitation.token;
    expect(
      (
        await api("/api/v1/chemistry-check/invitations/accept", {
          cookie: pair.second.cookie,
          body: { token, confirmLabel: "Sam" },
        })
      ).status,
    ).toBe(404);

    database.raw.prepare("DELETE FROM chemistry_assessments WHERE id = ?").run(pair.assessmentId);
    expect(
      (
        await api("/api/v1/chemistry-check/invitations/accept", {
          cookie: pair.second.cookie,
          body: { token, confirmLabel: "Sam" },
        })
      ).status,
    ).toBe(404);
    expect(database.raw.prepare("SELECT count(*) AS n FROM chemistry_pair_releases").get()).toEqual(
      {
        n: 1,
      },
    );
    database.raw.prepare("UPDATE chemistry_pair_releases SET last_released_at = 0").run();
    expect(
      (
        await api("/api/v1/chemistry-check/invitations/accept", {
          cookie: pair.second.cookie,
          body: { token, confirmLabel: "Sam" },
        })
      ).status,
    ).toBe(200);
  });

  it("bounds active invitations, daily creations and keeps sparse reports withheld", async () => {
    const first = await login();
    for (let index = 0; index < 3; index += 1) {
      expect(
        (
          await api("/api/v1/chemistry-check/assessments", {
            cookie: first.cookie,
            body: { depth: 25, inviteeLabel: "Sam" },
          })
        ).status,
      ).toBe(201);
    }
    expect(
      (
        await api("/api/v1/chemistry-check/assessments", {
          cookie: first.cookie,
          body: { depth: 25, inviteeLabel: "Sam" },
        })
      ).status,
    ).toBe(409);

    const busy = await login();
    for (let index = 0; index < 5; index += 1) {
      const created = await api("/api/v1/chemistry-check/assessments", {
        cookie: busy.cookie,
        body: { depth: 25, inviteeLabel: "Sam" },
      });
      expect(created.status).toBe(201);
      const id = ((await created.json()) as { assessment: { id: string } }).assessment.id;
      expect(
        (
          await api(`/api/v1/chemistry-check/assessments/${id}/invitation/revoke`, {
            cookie: busy.cookie,
            method: "POST",
          })
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await api("/api/v1/chemistry-check/assessments", {
          cookie: busy.cookie,
          body: { depth: 25, inviteeLabel: "Sam" },
        })
      ).status,
    ).toBe(409);

    const pair = await createPair();
    const sparse = submission(25, {
      responses: submission(25).responses.filter((response) => {
        const question = MANIFESTS[25].questions.find((entry) => entry.id === response.questionId);
        return question?.dimension === "goals" || question?.dimension === "lifestyle";
      }),
    });
    await submitBoth(pair, sparse, sparse);
    await approve(pair, "first");
    await approve(pair, "second");
    const released = await release(pair);
    expect(released.status).toBe(200);
    const payload = (await released.json()) as { report: { available: boolean } };
    expect(payload.report.available).toBe(false);
    const report = await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`, {
      cookie: pair.second.cookie,
    });
    expect(report.status).toBe(200);
    const withheld = (await report.json()) as {
      report: { available: boolean; dimensions: { band: string | null; detail: string }[] };
    };
    expect(withheld.report.available).toBe(false);
    expect(withheld.report.dimensions.every((entry) => entry.band === null)).toBe(true);
    expect(withheld.report.dimensions[0]?.detail).toBe("report_withheld");
  });
});

describe("concurrent release and ciphertext integrity", () => {
  it("never exposes a report after a concurrent withdrawal", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    await approve(pair, "first");
    await approve(pair, "second");
    const [releaseAttempt, withdrawAttempt] = await Promise.all([
      release(pair),
      api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/withdraw`, {
        cookie: pair.second.cookie,
        method: "POST",
      }),
    ]);
    expect([200, 409]).toContain(releaseAttempt.status);
    expect(withdrawAttempt.status).toBe(200);
    for (const member of [pair.first, pair.second])
      expect(
        (
          await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`, {
            cookie: member.cookie,
          })
        ).status,
      ).toBe(404);
    expect(database.raw.prepare("SELECT count(*) AS n FROM chemistry_results").get()).toEqual({
      n: 0,
    });
  });

  it("fails closed when a stored submission or report envelope is tampered with", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    await approve(pair, "first");
    await approve(pair, "second");
    const row = database.raw
      .prepare(
        "SELECT submission_envelope FROM chemistry_participants WHERE assessment_id = ? LIMIT 1",
      )
      .get(pair.assessmentId) as { submission_envelope: string };
    const record = JSON.parse(row.submission_envelope) as { ct: string };
    const flipped = `${record.ct.slice(0, 8)}${record.ct[8] === "A" ? "B" : "A"}${record.ct.slice(9)}`;
    database.raw
      .prepare(
        "UPDATE chemistry_participants SET submission_envelope = ? WHERE assessment_id = ? AND user_id = ?",
      )
      .run(
        JSON.stringify({ ...(JSON.parse(row.submission_envelope) as object), ct: flipped }),
        pair.assessmentId,
        pair.first.userId,
      );
    expect((await release(pair)).status).toBe(409);

    const cleanPair = await createPair();
    await submitBoth(cleanPair);
    await approve(cleanPair, "first");
    await approve(cleanPair, "second");
    expect((await release(cleanPair)).status).toBe(200);
    const result = database.raw
      .prepare("SELECT report_envelope FROM chemistry_results WHERE assessment_id = ?")
      .get(cleanPair.assessmentId) as { report_envelope: string };
    const reportRecord = JSON.parse(result.report_envelope) as { ct: string };
    database.raw
      .prepare("UPDATE chemistry_results SET report_envelope = ? WHERE assessment_id = ?")
      .run(
        JSON.stringify({
          ...(JSON.parse(result.report_envelope) as object),
          ct: `${reportRecord.ct.slice(0, 8)}${reportRecord.ct[8] === "A" ? "B" : "A"}${reportRecord.ct.slice(9)}`,
        }),
        cleanPair.assessmentId,
      );
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${cleanPair.assessmentId}/report`, {
          cookie: cleanPair.first.cookie,
        })
      ).status,
    ).toBe(404);
  });
});

// Independent adversarial review: barriers run real concurrent state changes during crypto awaits.
async function duringCrypto(method: "encrypt" | "decrypt", action: () => Promise<void>) {
  const original = crypto.subtle[method].bind(crypto.subtle);
  vi.spyOn(crypto.subtle, method).mockImplementationOnce(
    async (...args: Parameters<typeof original>) => {
      await action();
      return original(args[0], args[1], args[2]);
    },
  );
}

describe("C1.1 adversarial lifecycle interleavings", () => {
  it.each(["draft", "submission"])(
    "cannot repopulate %s after completed withdrawal",
    async (route) => {
      const pair = await createPair();
      await duringCrypto("encrypt", async () => {
        expect(
          (
            await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/withdraw`, {
              cookie: pair.second.cookie,
              method: "POST",
            })
          ).status,
        ).toBe(200);
      });
      const saved = await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/${route}`, {
        cookie: pair.first.cookie,
        method: route === "draft" ? "PUT" : "POST",
        body: { submission: submission(25) },
      });
      expect(saved.status).toBe(404);
      expect(
        database.raw
          .prepare("SELECT draft_envelope, submission_envelope FROM chemistry_participants")
          .all(),
      ).toEqual([
        { draft_envelope: null, submission_envelope: null },
        { draft_envelope: null, submission_envelope: null },
      ]);
    },
  );

  it("does not return a decrypted report after completed withdrawal", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    await approve(pair, "first");
    await approve(pair, "second");
    expect((await release(pair)).status).toBe(200);
    await duringCrypto("decrypt", async () => {
      expect(
        (
          await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/withdraw`, {
            cookie: pair.second.cookie,
            method: "POST",
          })
        ).status,
      ).toBe(200);
    });
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`, {
          cookie: pair.first.cookie,
        })
      ).status,
    ).toBe(404);
  });

  it("does not release an earlier wider approval during scope narrowing", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    await approve(pair, "first");
    await approve(pair, "second");
    await duringCrypto("encrypt", async () => {
      expect(
        (await approve(pair, "second", { dimensions: ["goals"], hardSignal: false })).status,
      ).toBe(200);
    });
    expect((await release(pair)).status).toBe(409);
    expect(database.raw.prepare("SELECT count(*) AS n FROM chemistry_results").get()).toEqual({
      n: 0,
    });
  });

  it("a competing release cannot delete the winning report", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    await approve(pair, "first");
    await approve(pair, "second");
    await duringCrypto("encrypt", async () => {
      expect((await release(pair)).status).toBe(200);
    });
    await release(pair);
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`, {
          cookie: pair.first.cookie,
        })
      ).status,
    ).toBe(200);
  });

  it("does not return a report to a session revoked during decryption", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    await approve(pair, "first");
    await approve(pair, "second");
    expect((await release(pair)).status).toBe(200);
    await duringCrypto("decrypt", async () => {
      database.raw.prepare("DELETE FROM auth_session WHERE userId = ?").run(pair.first.userId);
    });
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`, {
          cookie: pair.first.cookie,
        })
      ).status,
    ).toBe(404);
  });

  it("cannot read a draft whose deadline has passed even when cleanup is backlogged", async () => {
    const pair = await createPair();
    await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/draft`, {
      cookie: pair.first.cookie,
      method: "PUT",
      body: { submission: submission(25) },
    });
    // Bypass middleware cleanup to verify the service's own authorization invariant.
    const { readDraft, chemistryKeyring } = await import("../../src/services/chemistry-check");
    database.raw
      .prepare(
        "UPDATE chemistry_assessments SET assessment_expires_at = created_at - 1, created_at = created_at - 100 WHERE id = ?",
      )
      .run(pair.assessmentId);
    const keyring = await chemistryKeyring(env);
    expect(keyring).toBeTruthy();
    if (!keyring) throw new Error("missing test keyring");
    expect(await readDraft(env, keyring, pair.assessmentId, pair.first.userId)).toBeNull();
  });

  it("does not expose which counterpart has submitted through status", async () => {
    const pair = await createPair();
    await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/submission`, {
      cookie: pair.first.cookie,
      body: { submission: submission(25) },
    });
    const before = await (
      await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}`, {
        cookie: pair.first.cookie,
      })
    ).json();
    await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/submission`, {
      cookie: pair.second.cookie,
      body: { submission: submission(25) },
    });
    const after = await (
      await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}`, {
        cookie: pair.first.cookie,
      })
    ).json();
    expect(after).toEqual(before);
  });
});

describe("C1.1 backup quarantine and traffic-independent purge", () => {
  it("proves retained keys restore old access, then sanitizes a quarantined snapshot", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    await approve(pair, "first");
    await approve(pair, "second");
    expect((await release(pair)).status).toBe(200);
    const pending = await api("/api/v1/chemistry-check/assessments", {
      cookie: pair.second.cookie,
      body: { depth: 25, inviteeLabel: "Forwarded" },
    });
    const invitation = (await pending.json()) as { invitation: { token: string } };
    const dir = mkdtempSync(join(tmpdir(), "cheapseggs-restore-"));
    try {
      const snapshot = join(dir, "snapshot.sqlite");
      await backup(database.raw, snapshot);
      expect(
        (
          await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/withdraw`, {
            cookie: pair.second.cookie,
            method: "POST",
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`, {
            cookie: pair.second.cookie,
          })
        ).status,
      ).toBe(404);
      expect(
        (await accountCall("/api/account/delete", { confirmation: "DELETE" }, pair.first.cookie))
          .status,
      ).toBe(200);
      const subjects = database.raw
        .prepare("SELECT subject_id AS subjectId, deleted_at AS deletedAt FROM account_deletions")
        .all();
      const cutoff = Math.floor(Date.now() / 1000);
      database.raw.close();
      database = openTestSnapshot(snapshot);
      env.DB = database.db;
      // A real earlier SQLite snapshot resurrects both the deleted account/session and report.
      expect(
        (
          await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`, {
            cookie: pair.first.cookie,
          })
        ).status,
      ).toBe(200);
      const ledger = {
        completeFrom: 0,
        completeThrough: cutoff,
        source: "external drill capture before restore",
        subjects,
      };
      expect(() => restoreQuarantineSql(undefined, cutoff - 1, cutoff)).toThrow();
      expect(() =>
        restoreQuarantineSql({ ...ledger, completeThrough: cutoff - 1 }, cutoff - 1, cutoff),
      ).toThrow("incomplete_deletion_ledger");
      const sql = restoreQuarantineSql(ledger, cutoff - 1, cutoff);
      database.raw.exec(sql);
      database.raw.exec(sql);
      expect(database.raw.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect((await accountCall("/api/account", undefined, pair.first.cookie)).status).toBe(401);
      expect(
        database.raw.prepare("SELECT id FROM auth_user WHERE id = ?").get(pair.first.userId),
      ).toBeUndefined();
      expect(database.raw.prepare("SELECT count(*) AS n FROM chemistry_assessments").get()).toEqual(
        { n: 0 },
      );
      expect(
        (
          await api("/api/v1/chemistry-check/invitations/accept", {
            cookie: pair.second.cookie,
            body: { token: invitation.invitation.token, confirmLabel: "Forwarded" },
          })
        ).status,
      ).toBe(401);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("purges abandoned invitation drafts without a request or encryption key", async () => {
    const owner = await login();
    const created = await api("/api/v1/chemistry-check/assessments", {
      cookie: owner.cookie,
      body: { depth: 25, inviteeLabel: "Sam" },
    });
    const { assessment } = (await created.json()) as { assessment: { id: string } };
    await api(`/api/v1/chemistry-check/assessments/${assessment.id}/draft`, {
      cookie: owner.cookie,
      method: "PUT",
      body: { submission: submission(25) },
    });
    const { purgeExpired } = await import("../../src/services/chemistry-check");
    delete env.CHEMISTRY_ENVELOPE_KEY;
    delete env.CHEMISTRY_PRIVATE_ENABLED;
    const future = Math.floor(Date.now() / 1000) + 49 * 3600;
    await purgeExpired(env, future);
    expect(database.raw.prepare("SELECT draft_envelope FROM chemistry_participants").get()).toEqual(
      { draft_envelope: null },
    );
    await purgeExpired(env, future + 86400);
    expect(database.raw.prepare("SELECT count(*) AS n FROM chemistry_assessments").get()).toEqual({
      n: 0,
    });
  });
});

describe("C1.1 revocation, exact revision, and account expiry", () => {
  it("withdrawal survives exhausted budgets and expired adulthood", async () => {
    const pair = await createPair();
    const { takeChemistryBudget } = await import("../../src/services/chemistry-check");
    for (let i = 0; i < 240; i++) await takeChemistryBudget(env, "request", "local", 240, 900);
    database.raw
      .prepare(
        "UPDATE account_declarations SET expires_at = declared_at + 1, declared_at = declared_at - 100 WHERE user_id = ?",
      )
      .run(pair.first.userId);
    // Set expiry strictly in the past while preserving the declaration check constraint.
    database.raw
      .prepare("UPDATE account_declarations SET expires_at = ? WHERE user_id = ?")
      .run(Math.floor(Date.now() / 1000) - 1, pair.first.userId);
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/withdraw`, {
          cookie: pair.first.cookie,
          method: "POST",
        })
      ).status,
    ).toBe(200);
  });

  it("cannot approve the old submitted snapshot after saving an edited draft", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    await approve(pair, "first");
    await approve(pair, "second");
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/draft`, {
          cookie: pair.first.cookie,
          method: "PUT",
          body: { submission: submission(25) },
        })
      ).status,
    ).toBe(200);
    expect((await approve(pair, "first")).status).toBe(409);
    expect((await release(pair)).status).toBe(409);
  });

  it("cannot return a report when the other adult declaration expires", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    await approve(pair, "first");
    await approve(pair, "second");
    expect((await release(pair)).status).toBe(200);
    database.raw
      .prepare(
        "UPDATE account_declarations SET declared_at = declared_at - 100, expires_at = ? WHERE user_id = ?",
      )
      .run(Math.floor(Date.now() / 1000) - 1, pair.second.userId);
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`, {
          cookie: pair.first.cookie,
        })
      ).status,
    ).toBe(404);
  });

  it("a completed account deletion wins over report decryption", async () => {
    const pair = await createPair();
    await submitBoth(pair);
    await approve(pair, "first");
    await approve(pair, "second");
    expect((await release(pair)).status).toBe(200);
    await duringCrypto("decrypt", async () => {
      expect(
        (await accountCall("/api/account/delete", { confirmation: "DELETE" }, pair.second.cookie))
          .status,
      ).toBe(200);
    });
    expect(
      (
        await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/report`, {
          cookie: pair.first.cookie,
        })
      ).status,
    ).toBe(404);
  });
});

describe("C1.1 owner snapshot and session write guards", () => {
  it("the owner can reopen the submitted snapshot at its new draft revision", async () => {
    const pair = await createPair();
    const payload = submission(25);
    await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/draft`, {
      cookie: pair.first.cookie,
      method: "PUT",
      body: { submission: payload },
    });
    await submitBoth(pair);
    const own = await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/draft`, {
      cookie: pair.first.cookie,
    });
    expect(own.status).toBe(200);
    expect(await own.json()).toEqual({ submission: payload });
  });

  it.each(["draft", "submission"])(
    "revoking a session during %s encryption prevents its write",
    async (route) => {
      const pair = await createPair();
      await duringCrypto("encrypt", async () => {
        database.raw.prepare("DELETE FROM auth_session WHERE userId = ?").run(pair.first.userId);
      });
      const response = await api(
        `/api/v1/chemistry-check/assessments/${pair.assessmentId}/${route}`,
        {
          cookie: pair.first.cookie,
          method: route === "draft" ? "PUT" : "POST",
          body: { submission: submission(25) },
        },
      );
      expect(response.status).toBe(404);
      expect(
        database.raw
          .prepare(
            "SELECT draft_envelope, submission_envelope FROM chemistry_participants WHERE user_id = ?",
          )
          .get(pair.first.userId),
      ).toEqual({ draft_envelope: null, submission_envelope: null });
    },
  );
});

describe("C1.1 counterpart progress minimization", () => {
  it("approval acknowledgements do not distinguish the counterpart's submission state", async () => {
    const pair = await createPair();
    await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/submission`, {
      cookie: pair.first.cookie,
      body: { submission: submission(25) },
    });
    const before = await approve(pair, "first");
    expect(before.status).toBe(200);
    const firstView = await before.json();
    await api(`/api/v1/chemistry-check/assessments/${pair.assessmentId}/submission`, {
      cookie: pair.second.cookie,
      body: { submission: submission(25) },
    });
    const after = await approve(pair, "first");
    expect(after.status).toBe(200);
    expect(await after.json()).toEqual(firstView);
    expect(JSON.stringify(firstView)).not.toContain('"approved"');
    // The earlier epoch cannot authorize the later counterpart snapshot: both must approve again.
    expect((await release(pair)).status).toBe(409);
  });
});
