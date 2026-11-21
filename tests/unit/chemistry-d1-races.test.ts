import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MANIFESTS } from "../../src/content/chemistry/questions";
import type { AssessmentSubmission } from "../../src/domain/chemistry";
import type { Bindings } from "../../src/server/bindings";
import { ADULT_POLICY } from "../../src/services/auth";
import {
  acceptInvitation,
  approveRelease,
  createAssessment,
  readReleasedReport,
  releaseAssessment,
  saveDraft,
  submitAssessment,
  terminateAssessment,
} from "../../src/services/chemistry-check";
import { type ChemistryKeyring, loadChemistryKeyring } from "../../src/services/chemistry-envelope";

// Actual local D1, not the synchronous SQLite adapter. Crypto barriers leave no transaction
// open: an adversary commits an independent request before the paused operation continues.
let mf: Miniflare;
let env: Bindings;
let keys: ChemistryKeyring;
const now = () => Math.floor(Date.now() / 1000);
const submission: AssessmentSubmission = {
  depth: 25,
  manifestId: MANIFESTS[25].id,
  questionBankVersion: "chemistry-2026-11-19.v1",
  responses: MANIFESTS[25].questions.map((q) => ({
    questionId: q.id,
    questionVersion: q.version,
    state: "answered",
    own: [q.choices[0]?.id ?? ""],
    accept: "any",
    importance: "medium",
    dealbreaker: false,
    disclosure: q.intimate ? "private" : "summary",
  })),
  intimacyShared: false,
  hardSignal: false,
};
beforeEach(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch() {return new Response('test')}}",
      d1Databases: ["DB"],
    }),
  );
  const db = await mf.getD1Database("DB");
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(`migrations/${file}`, "utf8"));
  const schema = sqlite
    .prepare(
      "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index','trigger') ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 ELSE 3 END",
    )
    .all() as { sql: string }[];
  for (const row of schema) await db.prepare(row.sql).run();
  sqlite.close();
  env = {
    APP_ENV: "local",
    DB: db as unknown as D1Database,
    BETTER_AUTH_SECRET: "d1-races-test-only-secret-32-characters",
    CHEMISTRY_PRIVATE_ENABLED: "true",
    CHEMISTRY_ENVELOPE_KEY: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
      "base64url",
    ),
  } as Bindings;
  const loaded = await loadChemistryKeyring(env);
  if (!loaded) throw new Error("missing test keys");
  keys = loaded;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await mf?.dispose();
});
async function user() {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users(id,auth_subject) VALUES (?,?)").bind(id, id).run();
  await env.DB.prepare(
    "INSERT INTO account_declarations(user_id,policy_version,declared_at,expires_at) VALUES (?,?,?,?)",
  )
    .bind(id, ADULT_POLICY, now(), now() + 86400)
    .run();
  return id;
}
async function pair() {
  const a = await user(),
    b = await user();
  const created = await createAssessment(env, a, 25, "Sam", now());
  if (!created) throw new Error("create failed");
  const id = created.assessment.id;
  expect(await acceptInvitation(env, created.invitation.token, "Sam", b, now())).toEqual({
    assessmentId: id,
  });
  return { a, b, id };
}
async function ready() {
  const p = await pair();
  for (const u of [p.a, p.b])
    expect(await submitAssessment(env, keys, p.id, u, submission, now())).toBe(1);
  for (const u of [p.a, p.b])
    expect(
      await approveRelease(
        env,
        p.id,
        u,
        {
          dimensions: ["goals", "lifestyle", "communication"],
          intimacyShared: false,
          hardSignal: false,
        },
        now(),
      ),
    ).toBeTruthy();
  return p;
}
async function barrier(method: "encrypt" | "decrypt", action: () => Promise<void>) {
  const original = crypto.subtle[method].bind(crypto.subtle);
  vi.spyOn(crypto.subtle, method).mockImplementationOnce(
    async (...args: Parameters<typeof original>) => {
      await action();
      return original(args[0], args[1], args[2]);
    },
  );
}

describe("actual D1 adversarial interleavings", () => {
  it.each(["draft", "submission"])("%s cannot write after withdrawal commits", async (purpose) => {
    const p = await pair();
    await barrier("encrypt", async () => {
      expect(await terminateAssessment(env, p.id, "withdrawn", now())).toBe(true);
    });
    const save = purpose === "draft" ? saveDraft : submitAssessment;
    expect(await save(env, keys, p.id, p.a, submission, now())).toBeNull();
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS n FROM chemistry_participants WHERE draft_envelope IS NOT NULL OR submission_envelope IS NOT NULL",
      ).first(),
    ).toEqual({ n: 0 });
  });
  it("an approval narrowed during final encryption defeats the old release", async () => {
    const p = await ready();
    await barrier("encrypt", async () => {
      expect(
        await approveRelease(
          env,
          p.id,
          p.b,
          { dimensions: ["goals"], intimacyShared: false, hardSignal: false },
          now(),
        ),
      ).toBeTruthy();
    });
    expect(await releaseAssessment(env, keys, p.id, p.a, now())).toBeNull();
    expect(await env.DB.prepare("SELECT count(*) AS n FROM chemistry_results").first()).toEqual({
      n: 0,
    });
  });

  it.each(["withdrawal", "submission"])(
    "%s committed during final encryption defeats release",
    async (change) => {
      const p = await ready();
      await barrier("encrypt", async () => {
        if (change === "withdrawal")
          expect(await terminateAssessment(env, p.id, "withdrawn", now())).toBe(true);
        else expect(await submitAssessment(env, keys, p.id, p.b, submission, now())).toBe(2);
      });
      expect(await releaseAssessment(env, keys, p.id, p.a, now())).toBeNull();
      expect(await env.DB.prepare("SELECT count(*) AS n FROM chemistry_results").first()).toEqual({
        n: 0,
      });
    },
  );

  it("withdrawal during decryption defeats a report read", async () => {
    const p = await ready();
    expect(await releaseAssessment(env, keys, p.id, p.a, now())).toBeTruthy();
    await barrier("decrypt", async () => {
      await terminateAssessment(env, p.id, "withdrawn", now());
    });
    expect(await readReleasedReport(env, keys, p.id, p.a, now())).toBeNull();
  });
  it("two simultaneous release requests retain exactly one readable result", async () => {
    const p = await ready();
    const results = await Promise.all([
      releaseAssessment(env, keys, p.id, p.a, now()),
      releaseAssessment(env, keys, p.id, p.b, now()),
    ]);
    expect(results.some(Boolean)).toBe(true);
    expect(await readReleasedReport(env, keys, p.id, p.b, now())).toBeTruthy();
    expect(await env.DB.prepare("SELECT count(*) AS n FROM chemistry_results").first()).toEqual({
      n: 1,
    });
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
  it("competing claims cannot terminate the successful binding", async () => {
    const a = await user(),
      b = await user(),
      c = await user();
    const created = await createAssessment(env, a, 25, "Sam", now());
    if (!created) throw new Error("missing invitation");
    const claims = await Promise.all([
      acceptInvitation(env, created.invitation.token, "Sam", b, now()),
      acceptInvitation(env, created.invitation.token, "Sam", c, now()),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(
      await env.DB.prepare("SELECT status FROM chemistry_assessments WHERE id = ?")
        .bind(created.assessment.id)
        .first(),
    ).toEqual({ status: "collecting" });
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM chemistry_participants").first(),
    ).toEqual({ n: 2 });
  });
  it("five concurrent creates never exceed the three-pending cap", async () => {
    const a = await user();
    await Promise.all(Array.from({ length: 5 }, () => createAssessment(env, a, 25, "Sam", now())));
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS n FROM chemistry_invitations WHERE state = 'pending'",
      ).first(),
    ).toEqual({ n: 3 });
  });
});
