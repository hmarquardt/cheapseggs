import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { convertV4MiniflareOptions, Response as MFResponse, Miniflare } from "miniflare";

// Actual compiled production code + workerd + D1. All email network traffic is intercepted;
// no live service, credentials, user or test endpoint exists in the application.
let latestCode = "";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    workers: [
      {
        name: "application",
        modules: true,
        scriptPath: "dist/worker/index.js",
        compatibilityDate: "2026-11-19",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        bindings: {
          APP_ENV: "production",
          BETTER_AUTH_SECRET: "workerd-test-only-secret-32-characters",
          AUTH_EMAIL_ENABLED: "true",
          AUTH_EMAIL_FROM: "accounts@cheapseggs.com",
        },
        serviceBindings: { ACCOUNT_EMAIL: { name: "mail-test", entrypoint: "Mailbox" } },
      },
      {
        name: "mail-test",
        modules: true,
        compatibilityDate: "2026-11-19",
        script: `import { WorkerEntrypoint } from "cloudflare:workers";
      export class Mailbox extends WorkerEntrypoint {
        async send(message) { await fetch("https://email.test/capture", { method: "POST", body: JSON.stringify(message) }); return { messageId: "local-only" }; }
      }
      export default { fetch() { return new Response("no endpoint", { status: 404 }); } };`,
        outboundService: async (request) => {
          assert.equal(request.url, "https://email.test/capture");
          const body = (await request.json()) as { text: string; to: string };
          assert.equal(body.to, "worker@example.com");
          latestCode = body.text.match(/\b\d{8}\b/)?.[0] ?? "";
          assert.equal(latestCode.length, 8);
          return MFResponse.json({ id: "local-intercept-only" });
        },
      },
    ],
  }),
);
try {
  const db = await mf.getD1Database("DB");
  // D1 exec is line-oriented; prepared statements preserve multi-line trigger bodies.
  // Wrangler applies the same files in the separate local D1/browser CI steps.
  const { DatabaseSync } = await import("node:sqlite");
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
  for (const { sql } of schema) await db.prepare(sql).run();
  sqlite.close();
  const req = (path: string, body?: unknown, cookie = "") =>
    mf.dispatchFetch(`https://cheapseggs.com${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin: "https://cheapseggs.com",
        "content-type": "application/json",
        "x-cheapseggs-action": "account",
        "cf-connecting-ip": "192.0.2.1",
        cookie,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  assert.equal(
    (
      await req("/api/auth/email-otp/send-verification-otp", {
        email: "worker@example.com",
        adult: true,
      })
    ).status,
    200,
  );
  const verified = await req("/api/auth/sign-in/email-otp", {
    email: "worker@example.com",
    otp: latestCode,
    adult: true,
  });
  assert.equal(verified.status, 200);
  assert.deepEqual(await verified.json(), { ok: true });
  const setCookie = verified.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /__Host-cheapseggs.session=/);
  for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"])
    assert.ok(setCookie.toLowerCase().includes(attribute.toLowerCase()), attribute);
  assert.ok(!/domain=/i.test(setCookie));
  const cookie = setCookie.split(";")[0] as string;
  assert.equal((await req("/api/account", undefined, cookie)).status, 200);
  assert.equal(
    (
      await req("/api/auth/sign-in/email-otp", {
        email: "worker@example.com",
        otp: latestCode,
        adult: true,
      })
    ).status,
    400,
  );
  assert.equal((await req("/api/account/age-verification/start", {}, cookie)).status, 503);
  const removed = await req("/api/account/delete", { confirmation: "DELETE" }, cookie);
  assert.equal(removed.status, 200);
  assert.equal((await req("/api/account", undefined, cookie)).status, 401);
  assert.deepEqual(await db.prepare("SELECT count(*) AS n FROM auth_user").first(), { n: 0 });
  console.log(
    "workerd/D1: email OTP, host-only secure cookie, account access, replay denial, closed age provider and deletion passed. No email sent.",
  );
} finally {
  await mf.dispose();
}
