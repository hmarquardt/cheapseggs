import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ChemistryDepth, MANIFESTS } from "../../src/content/chemistry/questions";
import type { AssessmentSubmission } from "../../src/domain/chemistry";
import { app } from "../../src/server";
import type { Bindings } from "../../src/server/bindings";
import { createTestDatabase, type TestDatabase } from "../support/d1";

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
afterEach(() => database.raw.close());

async function createPair(depth: ChemistryDepth = 25) {
  const first = await login();
  const second = await login();
  const created = await api("/api/v1/chemistry-check/assessments", {
    cookie: first.cookie,
    body: { depth },
  });
  expect(created.status).toBe(201);
  const payload = (await created.json()) as {
    assessment: { id: string };
    invitation: { token: string };
  };
  const accepted = await api("/api/v1/chemistry-check/invitations/accept", {
    cookie: second.cookie,
    body: { token: payload.invitation.token },
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
      body: { depth: 25 },
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
          body: { token: payload.invitation.token },
        })
      ).status,
    ).toBe(404);

    const accepted = await api("/api/v1/chemistry-check/invitations/accept", {
      cookie: second.cookie,
      body: { token: payload.invitation.token },
    });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ assessmentId: payload.assessment.id });

    expect(
      (
        await api("/api/v1/chemistry-check/invitations/accept", {
          cookie: second.cookie,
          body: { token: payload.invitation.token },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api("/api/v1/chemistry-check/invitations/accept", {
          cookie: third.cookie,
          body: { token: payload.invitation.token },
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
      body: { depth: 50 },
    });
    expect(duplicate.status).toBe(201);
    const duplicatePayload = (await duplicate.json()) as { invitation: { token: string } };
    expect(
      (
        await api("/api/v1/chemistry-check/invitations/accept", {
          cookie: second.cookie,
          body: { token: duplicatePayload.invitation.token },
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
      body: { depth: 25 },
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
      body: { token: expiredPayload.invitation.token },
    });
    expect(late.status).toBe(404);
    expect(await late.json()).toEqual({ error: "not_found" });

    const revocable = await api("/api/v1/chemistry-check/assessments", {
      cookie: first.cookie,
      body: { depth: 25 },
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
          body: { token: revocablePayload.invitation.token },
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
      body: { depth: 25 },
    });
    const payload = (await created.json()) as {
      assessment: { id: string };
      invitation: { token: string };
    };
    const attempts = await Promise.all(
      [second, third].map((candidate) =>
        api("/api/v1/chemistry-check/invitations/accept", {
          cookie: candidate.cookie,
          body: { token: payload.invitation.token },
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
