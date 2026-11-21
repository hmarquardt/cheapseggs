import { afterAll, describe, expect, it } from "vitest";
import {
  intersectScopes,
  normalizeScope,
  pairKey,
  reportExpiresAt,
} from "../../src/domain/chemistry-lifecycle";
import { app } from "../../src/server";
import type { Bindings } from "../../src/server/bindings";
import {
  chemistryPrivateEnabled,
  parseSubmissionPayload,
  takeChemistryBudget,
} from "../../src/services/chemistry-check";
import {
  envelopeAad,
  loadChemistryKeyring,
  openEnvelope,
  sealEnvelope,
} from "../../src/services/chemistry-envelope";
import { createTestDatabase } from "../support/d1";

const keyBytes = (seed: number) => {
  const value = crypto.getRandomValues(new Uint8Array(32));
  value[0] = seed;
  return Buffer.from(value).toString("base64url");
};

function environment(overrides: Partial<Bindings> = {}): Bindings {
  return {
    APP_ENV: "local",
    BETTER_AUTH_SECRET: "chemistry-tests-only-strong-secret-32-characters",
    CHEMISTRY_PRIVATE_ENABLED: "true",
    CHEMISTRY_ENVELOPE_KEY: keyBytes(1),
    ...overrides,
  } as unknown as Bindings;
}

function environmentWithoutKey(overrides: Partial<Bindings> = {}): Bindings {
  const env = environment(overrides);
  delete env.CHEMISTRY_ENVELOPE_KEY;
  return env;
}

describe("private envelope cryptography", () => {
  it("round-trips with authenticated metadata and distinct nonces", async () => {
    const keyring = await loadChemistryKeyring(environment());
    expect(keyring).not.toBeNull();
    if (!keyring) return;
    const aad = envelopeAad(["submission", "assessment", "user", "1", "manifest"]);
    const first = await sealEnvelope(JSON.stringify({ hello: "world" }), aad, keyring);
    const second = await sealEnvelope(JSON.stringify({ hello: "world" }), aad, keyring);
    expect(first.envelope).not.toBe(second.envelope);
    expect(await openEnvelope(first.envelope, aad, keyring)).toBe('{"hello":"world"}');
    const parsed = JSON.parse(first.envelope) as { kv: number; ct: string; iv: string };
    expect(parsed.kv).toBe(1);
    expect(parsed.iv.length).toBeGreaterThan(10);
    const ciphertext = Buffer.from(parsed.ct, "base64url");
    expect(ciphertext.length % 512).toBe(16);
  });

  it("rejects tampering, wrong metadata, unknown versions and missing keys", async () => {
    const keyring = await loadChemistryKeyring(environment());
    expect(keyring).not.toBeNull();
    if (!keyring) return;
    const aad = envelopeAad(["draft", "a", "u", "3", "m"]);
    const sealed = await sealEnvelope("private", aad, keyring);
    const record = JSON.parse(sealed.envelope) as { ct: string };
    const flipped = `${record.ct.slice(0, 10)}${record.ct[10] === "A" ? "B" : "A"}${record.ct.slice(11)}`;
    const tampered = JSON.stringify({ ...record, ct: flipped });
    await expect(openEnvelope(tampered, aad, keyring)).rejects.toThrow("envelope_rejected");
    await expect(
      openEnvelope(sealed.envelope, envelopeAad(["draft", "a", "other", "3", "m"]), keyring),
    ).rejects.toThrow("envelope_rejected");
    const unknownVersion = JSON.stringify({
      ...(JSON.parse(sealed.envelope) as object),
      kv: 42,
    });
    await expect(openEnvelope(unknownVersion, aad, keyring)).rejects.toThrow(
      "envelope_key_unavailable",
    );
    expect(await loadChemistryKeyring(environment({ CHEMISTRY_ENVELOPE_KEY: "short" }))).toBeNull();
    expect(await loadChemistryKeyring(environmentWithoutKey())).toBeNull();
  });
});

describe("key rotation and production gate", () => {
  it("decrypts a rotated key version and refuses a removed version", async () => {
    const oldKey = keyBytes(2);
    const newKey = keyBytes(3);
    const oldKeyring = await loadChemistryKeyring(
      environment({ CHEMISTRY_ENVELOPE_KEY: oldKey, CHEMISTRY_ENVELOPE_KEY_VERSION: "2" }),
    );
    expect(oldKeyring).not.toBeNull();
    if (!oldKeyring) return;
    const aad = envelopeAad(["report", "a", "1", "digest"]);
    const sealed = await sealEnvelope("report-body", aad, oldKeyring);
    const rotated = await loadChemistryKeyring(
      environment({
        CHEMISTRY_ENVELOPE_KEY: newKey,
        CHEMISTRY_ENVELOPE_KEY_VERSION: "3",
        CHEMISTRY_ENVELOPE_PREVIOUS_KEYS: JSON.stringify({ "2": oldKey }),
      }),
    );
    expect(rotated).not.toBeNull();
    if (!rotated) return;
    expect(await openEnvelope(sealed.envelope, aad, rotated)).toBe("report-body");
    const withoutOld = await loadChemistryKeyring(
      environment({ CHEMISTRY_ENVELOPE_KEY: newKey, CHEMISTRY_ENVELOPE_KEY_VERSION: "3" }),
    );
    expect(withoutOld).not.toBeNull();
    if (!withoutOld) return;
    await expect(openEnvelope(sealed.envelope, aad, withoutOld)).rejects.toThrow(
      "envelope_key_unavailable",
    );
  });

  it("keeps production closed without the independent review flag", () => {
    expect(chemistryPrivateEnabled(environment())).toBe(true);
    expect(chemistryPrivateEnabled(environment({ APP_ENV: "production" }))).toBe(false);
    expect(
      chemistryPrivateEnabled(
        environment({ APP_ENV: "production", CHEMISTRY_PRIVATE_REVIEW_APPROVED: "true" }),
      ),
    ).toBe(true);
    expect(chemistryPrivateEnabled(environment({ CHEMISTRY_PRIVATE_ENABLED: "false" }))).toBe(
      false,
    );
  });
});

describe("assessment lifecycle primitives", () => {
  it("builds an unordered pair key and a fixed 30-day report deadline", () => {
    expect(pairKey("b", "a")).toBe(pairKey("a", "b"));
    expect(pairKey("a", "b")).not.toBe(pairKey("a", "c"));
    expect(reportExpiresAt(1000)).toBe(1000 + 30 * 86400);
  });

  it("rejects malformed release scopes and intersects only compatible ones", () => {
    const expiresAt = 5000;
    expect(
      normalizeScope({
        dimensions: ["goals"],
        intimacyShared: false,
        hardSignal: false,
        expiresAt,
      }),
    ).not.toBeNull();
    expect(
      normalizeScope({ dimensions: [], intimacyShared: false, hardSignal: false, expiresAt }),
    ).toBeNull();
    expect(
      normalizeScope({
        dimensions: ["goals", "goals"],
        intimacyShared: false,
        hardSignal: false,
        expiresAt,
      }),
    ).toBeNull();
    expect(
      normalizeScope({
        dimensions: ["unknown"],
        intimacyShared: false,
        hardSignal: false,
        expiresAt,
      }),
    ).toBeNull();
    const first = normalizeScope({
      dimensions: ["goals", "humor", "values"],
      intimacyShared: false,
      hardSignal: true,
      expiresAt,
    });
    const second = normalizeScope({
      dimensions: ["humor", "values", "adventure"],
      intimacyShared: false,
      hardSignal: true,
      expiresAt,
    });
    expect(first && second && intersectScopes(first, second)?.dimensions).toEqual([
      "humor",
      "values",
    ]);
    const differentFlag = normalizeScope({
      dimensions: ["humor"],
      intimacyShared: false,
      hardSignal: false,
      expiresAt,
    });
    expect(differentFlag && first && intersectScopes(first, differentFlag)).toBeNull();
    const differentDeadline = normalizeScope({
      dimensions: ["humor"],
      intimacyShared: false,
      hardSignal: true,
      expiresAt: 6000,
    });
    expect(differentDeadline && first && intersectScopes(first, differentDeadline)).toBeNull();
  });
});

describe("assessment schema invariants", () => {
  it("enforces pair uniqueness, slot shape, invitation and result guards", () => {
    const database = createTestDatabase();
    const raw = database.raw;
    try {
      raw.exec("INSERT INTO users(id,auth_subject) VALUES ('u1','u1'),('u2','u2')");
      const now = 1000;
      raw
        .prepare(
          `INSERT INTO chemistry_assessments
           (id,family,manifest_id,question_bank_version,algorithm_version,depth,status,created_by,created_at,accepted_at,pair_key,assessment_expires_at)
           VALUES ('a1','f','m','b','alg',25,'collecting','u1',?,?,?,?)`,
        )
        .run(now, now, "pair-1", now + 1000);
      expect(() =>
        raw
          .prepare(
            `INSERT INTO chemistry_assessments
             (id,family,manifest_id,question_bank_version,algorithm_version,depth,status,created_by,created_at,accepted_at,pair_key,assessment_expires_at)
             VALUES ('a2','f','m','b','alg',25,'collecting','u1',?,?,?,?)`,
          )
          .run(now, now, "pair-1", now + 1000),
      ).toThrow();
      raw
        .prepare(
          "INSERT INTO chemistry_participants(assessment_id,user_id,slot,role,joined_at) VALUES ('a1','u1',1,'creator',?)",
        )
        .run(now);
      expect(() =>
        raw
          .prepare(
            "INSERT INTO chemistry_participants(assessment_id,user_id,slot,role,joined_at) VALUES ('a1','u2',1,'invitee',?)",
          )
          .run(now),
      ).toThrow();
      raw
        .prepare(
          "INSERT INTO chemistry_participants(assessment_id,user_id,slot,role,joined_at) VALUES ('a1','u2',2,'invitee',?)",
        )
        .run(now);
      expect(() =>
        raw
          .prepare(
            "INSERT INTO chemistry_invitations(id,assessment_id,token_digest,created_by,created_at,expires_at) VALUES ('i1','a1','short','u1',?,?)",
          )
          .run(now, now + 10),
      ).toThrow();
      raw
        .prepare(
          "INSERT INTO chemistry_invitations(id,assessment_id,token_digest,created_by,created_at,expires_at,state) VALUES ('i1','a1',?,'u1',?,?,'pending')",
        )
        .run("a".repeat(64), now, now + 10);
      raw
        .prepare(
          "UPDATE chemistry_invitations SET state='consumed', consumed_at=?, consumed_by='u2' WHERE id='i1'",
        )
        .run(now);
      expect(() =>
        raw.prepare("UPDATE chemistry_invitations SET state='pending' WHERE id='i1'").run(),
      ).toThrow();
      expect(() =>
        raw
          .prepare(
            `INSERT INTO chemistry_results(assessment_id,result_epoch,report_envelope,envelope_key_version,scope_digest,created_at,expires_at)
             VALUES ('a1',1,'env',1,?,?,?)`,
          )
          .run("b".repeat(64), now, now + 5),
      ).toThrow();
    } finally {
      raw.close();
    }
  });

  it("advances submission revisions monotonically and guards the result epoch", () => {
    const database = createTestDatabase();
    const raw = database.raw;
    try {
      raw.exec("INSERT INTO users(id,auth_subject) VALUES ('u1','u1')");
      raw.exec(
        `INSERT INTO chemistry_assessments
         (id,family,manifest_id,question_bank_version,algorithm_version,depth,status,created_by,created_at,pair_key)
         VALUES ('a1','f','m','b','alg',25,'collecting','u1',1,'pair')`,
      );
      raw.exec(
        "INSERT INTO chemistry_participants(assessment_id,user_id,slot,role,joined_at) VALUES ('a1','u1',1,'creator',1)",
      );
      raw
        .prepare(
          "UPDATE chemistry_participants SET submission_revision=1, submitted_at=2, submission_envelope='env', submission_key_version=1, submission_digest=? WHERE assessment_id='a1' AND user_id='u1'",
        )
        .run("c".repeat(64));
      expect(() =>
        raw
          .prepare(
            "UPDATE chemistry_participants SET submission_revision=1 WHERE assessment_id='a1' AND user_id='u1'",
          )
          .run(),
      ).toThrow();
      raw.exec(
        "UPDATE chemistry_assessments SET status='awaiting_release', result_epoch=2 WHERE id='a1'",
      );
      expect(() =>
        raw
          .prepare(
            `INSERT INTO chemistry_results(assessment_id,result_epoch,report_envelope,envelope_key_version,scope_digest,created_at,expires_at)
             VALUES ('a1',1,'env',1,?,10,20)`,
          )
          .run("d".repeat(64)),
      ).toThrow();
      raw
        .prepare(
          `INSERT INTO chemistry_results(assessment_id,result_epoch,report_envelope,envelope_key_version,scope_digest,created_at,expires_at)
           VALUES ('a1',2,'env',1,?,10,20)`,
        )
        .run("d".repeat(64));
      expect(raw.prepare("SELECT count(*) AS n FROM chemistry_results").get()).toEqual({ n: 1 });
    } finally {
      raw.close();
    }
  });

  it("removes every private envelope when either account is deleted", () => {
    const database = createTestDatabase();
    const raw = database.raw;
    try {
      raw.exec("INSERT INTO users(id,auth_subject) VALUES ('u1','u1'),('u2','u2')");
      raw.exec(
        `INSERT INTO chemistry_assessments
         (id,family,manifest_id,question_bank_version,algorithm_version,depth,status,created_by,created_at,accepted_at,pair_key,assessment_expires_at)
         VALUES ('a1','f','m','b','alg',25,'awaiting_release','u1',1,1,'pair',99999)`,
      );
      raw.exec(
        "INSERT INTO chemistry_participants(assessment_id,user_id,slot,role,joined_at) VALUES ('a1','u1',1,'creator',1),('a1','u2',2,'invitee',1)",
      );
      raw
        .prepare(
          `INSERT INTO chemistry_results(assessment_id,result_epoch,report_envelope,envelope_key_version,scope_digest,created_at,expires_at)
           VALUES ('a1',1,'envelope',1,?,10,20)`,
        )
        .run("e".repeat(64));
      raw.prepare("DELETE FROM users WHERE id='u2'").run();
      expect(raw.prepare("SELECT count(*) AS n FROM chemistry_assessments").get()).toEqual({
        n: 0,
      });
      expect(raw.prepare("SELECT count(*) AS n FROM chemistry_participants").get()).toEqual({
        n: 0,
      });
      expect(raw.prepare("SELECT count(*) AS n FROM chemistry_results").get()).toEqual({ n: 0 });
    } finally {
      raw.close();
    }
  });

  it("rejects question ids outside the manifest before encryption", () => {
    expect(
      parseSubmissionPayload({
        depth: 25,
        manifestId: "chemistry-2026-11-19.v1/25",
        questionBankVersion: "chemistry-2026-11-19.v1",
        responses: [
          {
            questionId: "not-a-question",
            questionVersion: 1,
            state: "answered",
            own: ["this-week"],
            accept: "any",
            importance: "medium",
            dealbreaker: false,
            disclosure: "summary",
          },
        ],
        intimacyShared: false,
        hardSignal: false,
      }),
    ).toBeNull();
  });

  it("stores only keyed, expiring abuse counters", async () => {
    const database = createTestDatabase();
    try {
      const env = environment({ DB: database.db });
      expect(await takeChemistryBudget(env, "invite-day", "user-1", 2, 86400)).toBe(true);
      expect(await takeChemistryBudget(env, "invite-day", "user-1", 2, 86400)).toBe(true);
      expect(await takeChemistryBudget(env, "invite-day", "user-1", 2, 86400)).toBe(false);
      const stored = JSON.stringify(database.raw.prepare("SELECT * FROM chemistry_budgets").all());
      expect(stored).not.toContain("user-1");
    } finally {
      database.raw.close();
    }
  });
});

describe("private API gate", () => {
  const database = createTestDatabase();
  afterAll(() => database.raw.close());
  const origin = "http://127.0.0.1:8787";
  const call = (env: Bindings, path: string, method = "GET", extra: Record<string, string> = {}) =>
    app.request(
      `${origin}${path}`,
      {
        method,
        headers: {
          origin,
          "content-type": "application/json",
          "x-cheapseggs-action": "chemistry",
          ...extra,
        },
        ...(method === "GET" ? {} : { body: JSON.stringify({ depth: 25 }) }),
      },
      env,
    );

  it("returns an indistinguishable 404 in production without the review flag", async () => {
    const env = environment({ APP_ENV: "production", DB: database.db });
    for (const path of ["/api/v1/chemistry-check/status", "/api/v1/chemistry-check/assessments"]) {
      const response = await call(env, path);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    }
    const created = await call(env, "/api/v1/chemistry-check/assessments", "POST");
    expect(created.status).toBe(404);
  });

  it("requires identity and same-origin JSON when the gate is open locally", async () => {
    const env = environment({ DB: database.db });
    const anonymous = await call(env, "/api/v1/chemistry-check/assessments");
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ error: "sign_in_required" });
    const wrongOrigin = await call(env, "/api/v1/chemistry-check/assessments", "POST", {
      origin: "https://evil.example",
    });
    expect(wrongOrigin.status).toBe(403);
    expect(await wrongOrigin.json()).toEqual({ error: "request_not_allowed" });
    const missingAction = await call(env, "/api/v1/chemistry-check/assessments", "POST", {
      "x-cheapseggs-action": "account",
    });
    expect(missingAction.status).toBe(403);
    const status = await call(env, "/api/v1/chemistry-check/status");
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ available: true });
  });

  it("closes every private route when the envelope key is absent", async () => {
    const env = environmentWithoutKey({ DB: database.db });
    const response = await call(env, "/api/v1/chemistry-check/status");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
