import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { convertV4MiniflareOptions, Response as MFResponse, Miniflare } from "miniflare";
import { MANIFESTS } from "../src/content/chemistry/questions.ts";
import { CHEMISTRY_GATE_METHODS, CHEMISTRY_GATE_PATHS } from "./chemistry-gate-paths.ts";

// Actual compiled Worker/D1 with synthetic identities and test-only keys. No outbound email.
const currentKey = randomBytes(32).toString("base64url");
const nextKey = randomBytes(32).toString("base64url");
const codes = new Map<string, string>();
const bindings: Record<string, string> = {
  APP_ENV: "production",
  BETTER_AUTH_SECRET: "compiled-chemistry-audit-only-32-character-secret",
  AUTH_EMAIL_ENABLED: "true",
  AUTH_EMAIL_FROM: "accounts@cheapseggs.com",
  CHEMISTRY_PRIVATE_ENABLED: "true",
  CHEMISTRY_PRIVATE_REVIEW_APPROVED: "true",
  CHEMISTRY_ENVELOPE_KEY: currentKey,
  CHEMISTRY_ENVELOPE_KEY_VERSION: "1",
};
const options = () =>
  convertV4MiniflareOptions({
    workers: [
      {
        name: "application",
        modules: true,
        scriptPath: "dist/worker/index.js",
        compatibilityDate: "2026-11-19",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        bindings,
        serviceBindings: { ACCOUNT_EMAIL: { name: "mail-test", entrypoint: "Mailbox" } },
      },
      {
        name: "mail-test",
        modules: true,
        compatibilityDate: "2026-11-19",
        script: `import { WorkerEntrypoint } from "cloudflare:workers";
    export class Mailbox extends WorkerEntrypoint {
      async send(message) { await fetch("https://email.test/capture", {method:"POST",body:JSON.stringify(message)}); return {messageId:"test"}; }
    }
    export default {fetch() {return new Response("closed", {status:404});}};`,
        outboundService: async (request) => {
          assert.equal(request.url, "https://email.test/capture");
          const body = (await request.json()) as { to: string; text: string };
          codes.set(body.to, body.text.match(/\b\d{8}\b/)?.[0] ?? "");
          return MFResponse.json({ id: "test-only" });
        },
      },
    ],
  });
const mf = new Miniflare(options());
const call = (
  path: string,
  cookie = "",
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
) =>
  mf.dispatchFetch(`https://cheapseggs.com${path}`, {
    method,
    headers: {
      origin: "https://cheapseggs.com",
      "content-type": "application/json",
      "x-cheapseggs-action": path.includes("chemistry-check") ? "chemistry" : "account",
      "cf-connecting-ip": "192.0.2.7",
      cookie,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const root = "/api/v1/chemistry-check";
const payload = {
  depth: 25,
  manifestId: MANIFESTS[25].id,
  questionBankVersion: "chemistry-2026-11-19.v1",
  responses: MANIFESTS[25].questions.map((q) => ({
    questionId: q.id,
    questionVersion: q.version,
    state: "answered",
    own: [q.choices[0]?.id],
    accept: "any",
    importance: "medium",
    dealbreaker: false,
    disclosure: q.intimate ? "private" : "summary",
  })),
  intimacyShared: false,
  hardSignal: false,
};
try {
  let db = await mf.getD1Database("DB");
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations")
    .filter((x) => x.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(`migrations/${file}`, "utf8"));
  const schema = sqlite
    .prepare(
      "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index','trigger') ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 ELSE 3 END",
    )
    .all() as { sql: string }[];
  for (const row of schema) await db.prepare(row.sql).run();
  sqlite.close();
  const login = async (index: number) => {
    const email = `compiled-${index}@example.com`;
    assert.equal(
      (await call("/api/auth/email-otp/send-verification-otp", "", { email, adult: true })).status,
      200,
    );
    const response = await call("/api/auth/sign-in/email-otp", "", {
      email,
      adult: true,
      otp: codes.get(email),
    });
    assert.equal(response.status, 200);
    return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  };
  const first = await login(1),
    second = await login(2),
    third = await login(3);
  const create = async () => {
    const response = await call(`${root}/assessments`, first, { depth: 25, inviteeLabel: "Sam" });
    assert.equal(response.status, 201);
    return (await response.json()) as { assessment: { id: string }; invitation: { token: string } };
  };
  const created = await create();
  const id = created.assessment.id;
  const path = `${root}/assessments/${id}`;
  const claim = (cookie: string) =>
    call(`${root}/invitations/accept`, cookie, {
      token: created.invitation.token,
      confirmLabel: "Sam",
    });
  assert.equal((await claim(first)).status, 404);
  // Forwarded bearer link + known label is enough for any independent adult account.
  const claims = await Promise.all([claim(second), claim(third)]);
  assert.deepEqual(claims.map((r) => r.status).sort(), [200, 404]);
  const invitee = claims[0]?.status === 200 ? second : third;
  const outsider = invitee === second ? third : second;
  assert.equal((await claim(invitee)).status, 404);
  assert.equal((await call(path, first)).status, 200, "loser must not terminate winner");
  for (const suffix of ["", "/draft", "/report"])
    assert.equal((await call(path + suffix, outsider)).status, 404);
  for (const cookie of [first, invitee]) {
    assert.equal((await call(`${path}/draft`, cookie, { submission: payload }, "PUT")).status, 200);
    assert.equal((await call(`${path}/submission`, cookie, { submission: payload })).status, 200);
    assert.equal((await call(`${path}/draft`, outsider)).status, 404);
  }
  for (const cookie of [first, invitee])
    assert.equal(
      (
        await call(`${path}/approval`, cookie, {
          dimensions: ["goals", "lifestyle", "communication"],
          intimacyShared: false,
          hardSignal: false,
        })
      ).status,
      200,
    );
  const released = await Promise.all([
    call(`${path}/release`, first, {}, "POST"),
    call(`${path}/release`, invitee, {}, "POST"),
  ]);
  assert.ok(released.some((r) => r.status === 200));
  const report = await call(`${path}/report`, first);
  assert.equal(report.status, 200);
  assert.deepEqual(await report.json(), await (await call(`${path}/report`, invitee)).json());
  assert.deepEqual(await db.prepare("SELECT count(*) AS n FROM couples").first(), { n: 0 });
  assert.deepEqual(
    await db
      .prepare("PRAGMA foreign_key_check")
      .all()
      .then((r) => r.results),
    [],
  );

  // Rotation drill: keep old for reads, write new, retire old only after every readable
  // draft/submission/report has expired or been purged. No production secret is touched.
  bindings.CHEMISTRY_ENVELOPE_KEY = nextKey;
  bindings.CHEMISTRY_ENVELOPE_KEY_VERSION = "2";
  bindings.CHEMISTRY_ENVELOPE_PREVIOUS_KEYS = JSON.stringify({ "1": currentKey });
  await mf.setOptions(options());
  db = await mf.getD1Database("DB");
  assert.equal((await call(`${path}/report`, first)).status, 200);
  delete bindings.CHEMISTRY_ENVELOPE_PREVIOUS_KEYS;
  await mf.setOptions(options());
  db = await mf.getD1Database("DB");
  assert.equal(
    (await call(`${path}/report`, first)).status,
    404,
    "premature retirement fails closed, not data loss recovery",
  );
  bindings.CHEMISTRY_ENVELOPE_PREVIOUS_KEYS = JSON.stringify({ "1": currentKey });
  await mf.setOptions(options());
  db = await mf.getD1Database("DB");
  assert.equal(
    (await call(`${path}/report`, first)).status,
    200,
    "old data recovers when retained key is restored",
  );
  assert.equal((await call(`${path}/withdraw`, invitee, {}, "POST")).status, 200);
  assert.equal((await call(`${path}/report`, first)).status, 404);
  assert.deepEqual(
    await db
      .prepare(
        "SELECT count(*) AS n FROM chemistry_participants WHERE draft_envelope IS NOT NULL OR submission_envelope IS NOT NULL",
      )
      .first(),
    { n: 0 },
  );
  assert.equal(
    (
      await call(`${root}/invitations/accept`, invitee, {
        token: (await create()).invitation.token,
        confirmLabel: "Sam",
      })
    ).status,
    404,
    "cooldown after withdrawal",
  );

  // D1 serializes competing writes: at most three pending invitations, five daily attempts.
  const burst = await Promise.all(
    Array.from({ length: 5 }, () =>
      call(`${root}/assessments`, first, { depth: 25, inviteeLabel: "Sam" }),
    ),
  );
  assert.ok(burst.some((r) => r.status === 409));
  const pending = await db
    .prepare("SELECT count(*) AS n FROM chemistry_invitations WHERE state = 'pending'")
    .first<{ n: number }>();
  assert.ok(pending && pending.n <= 3);
  // Closed flag/missing or malformed keys: every private path and method is unavailable.
  for (const change of ["flag", "review", "key", "bad-key"]) {
    bindings.CHEMISTRY_PRIVATE_ENABLED = change === "flag" ? "false" : "true";
    bindings.CHEMISTRY_PRIVATE_REVIEW_APPROVED = change === "review" ? "false" : "true";
    bindings.CHEMISTRY_ENVELOPE_KEY =
      change === "key" ? "" : change === "bad-key" ? "bad" : nextKey;
    await mf.setOptions(options());
    db = await mf.getD1Database("DB");
    for (const method of CHEMISTRY_GATE_METHODS) {
      for (const route of CHEMISTRY_GATE_PATHS)
        assert.equal(
          (await call(route, first, undefined, method)).status,
          404,
          `${change} ${method} ${route}`,
        );
    }
  }
  // Scheduled cleanup runs with collection closed and no envelope key or request traffic.
  const worker = await mf.getWorker();
  await worker.scheduled({
    scheduledTime: new Date(Date.now() + 50 * 3600000),
    cron: "17 * * * *",
  });
  assert.deepEqual(
    await db
      .prepare("SELECT count(*) AS n FROM chemistry_invitations WHERE state = 'pending'")
      .first(),
    { n: 0 },
  );
  console.log(
    "workerd/D1 Chemistry: three-account matrix; competing claims, releases and invite cap; scope; cooldown; retained/retired test-key drill; 364 disabled route/method checks; scheduled cleanup; FKs passed. No email sent.",
  );
} finally {
  await mf.dispose();
}
