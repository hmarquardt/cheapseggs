import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/server";
import type { Bindings } from "../../src/server/bindings";
import { AUTH_IDLE } from "../../src/services/auth";
import { createTestDatabase, type TestDatabase } from "../support/d1";

const ORIGIN = "http://127.0.0.1:8787";
let database: TestDatabase;
let env: Bindings;
let delivered: { email: string; otp: string }[];
function request(path: string, body?: unknown, cookie = "", extras: Record<string, string> = {}) {
  return app.request(
    `${ORIGIN}${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "x-cheapseggs-action": "account",
        cookie,
        ...extras,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  );
}
async function login(email = "adult@example.com", recovery = false) {
  const sent = await request("/api/auth/email-otp/send-verification-otp", { email, adult: true });
  expect(sent.status).toBe(200);
  const code = delivered.at(-1)?.otp;
  const result = await request("/api/auth/sign-in/email-otp", {
    email,
    otp: code,
    adult: true,
    recovery,
  });
  expect(result.status).toBe(200);
  expect(await result.clone().json()).toEqual({ ok: true });
  return { cookie: result.headers.get("set-cookie")?.split(";")[0] ?? "", code };
}
beforeEach(() => {
  database = createTestDatabase();
  delivered = [];
  env = {
    DB: database.db,
    APP_ENV: "local",
    ASSETS: undefined as unknown as Fetcher,
    BETTER_AUTH_SECRET: "unit-tests-only-strong-secret-32-characters",
    AUTH_TEST_DELIVER: async (data) => {
      delivered.push(data);
    },
  };
});
afterEach(() => database.raw.close());

describe("reviewed email identity and account lifecycle", () => {
  it("registers verified email with self-declaration, secure boundaries and no client token", async () => {
    const { cookie } = await login();
    expect(cookie).toContain("cheapseggs.session=");
    const response = await request("/api/account", undefined, cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      state: "registered_self_declared_adult",
      adultStatus: { selfDeclared: true, independentlyVerified: false },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(database.raw.prepare("SELECT ipAddress,userAgent FROM auth_session").get()).toEqual({
      ipAddress: null,
      userAgent: null,
    });
    expect(
      JSON.stringify(database.raw.prepare("SELECT value FROM auth_verification").all()),
    ).not.toContain(delivered[0]?.otp);
  });
  it("rejects scanners, unknown framework endpoints, wrong origins and unacknowledged adulthood", async () => {
    expect((await request("/api/auth/sign-in/email-otp")).status).not.toBe(200);
    expect(
      (
        await request("/api/auth/email-otp/send-verification-otp", {
          email: "adult@example.com",
          adult: false,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "/api/auth/email-otp/send-verification-otp",
          { email: "adult@example.com", adult: true },
          "",
          { origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403);
    expect((await request("/api/auth/sign-in/email-otp", {}, "", { origin: "" })).status).toBe(403);
    expect(
      (await request("/api/auth/sign-in/email-otp", {}, "", { "x-cheapseggs-action": "" })).status,
    ).toBe(403);
    expect((await request("/api/auth/email-otp/get-verification-otp", {})).status).not.toBe(200);
    expect(delivered).toHaveLength(0);
  });
  it("rejects replay, incorrect codes and parallel double-use", async () => {
    const first = await login();
    expect(
      (
        await request("/api/auth/sign-in/email-otp", {
          email: "adult@example.com",
          adult: true,
          otp: first.code,
        })
      ).status,
    ).toBe(400);
    await request("/api/auth/email-otp/send-verification-otp", {
      email: "adult@example.com",
      adult: true,
    });
    const code = delivered.at(-1)?.otp;
    const attempts = await Promise.all(
      [1, 2].map(() =>
        request("/api/auth/sign-in/email-otp", {
          email: "adult@example.com",
          adult: true,
          otp: code,
        }),
      ),
    );
    expect(attempts.map((r) => r.status).sort()).toEqual([200, 400]);
  });
  it("enforces OTP expiry and bounded attempts", async () => {
    await request("/api/auth/email-otp/send-verification-otp", {
      email: "adult@example.com",
      adult: true,
    });
    const code = delivered.at(-1)?.otp;
    for (let i = 0; i < 5; i++)
      expect(
        (
          await request("/api/auth/sign-in/email-otp", {
            email: "adult@example.com",
            adult: true,
            otp: "00000000" === code ? "11111111" : "00000000",
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await request("/api/auth/sign-in/email-otp", {
          email: "adult@example.com",
          adult: true,
          otp: code,
        })
      ).status,
    ).toBe(400);
    await request("/api/auth/email-otp/send-verification-otp", {
      email: "adult@example.com",
      adult: true,
    });
    database.raw
      .prepare("UPDATE auth_verification SET expiresAt = ?")
      .run(new Date(Date.now() - 1).toISOString());
    expect(
      (
        await request("/api/auth/sign-in/email-otp", {
          email: "adult@example.com",
          adult: true,
          otp: delivered.at(-1)?.otp,
        })
      ).status,
    ).toBe(400);
  });
  it("lists no bearer tokens; prevents foreign revocation; recovers and revokes all other sessions", async () => {
    const first = await login();
    const second = await login();
    const foreign = await login("other@example.com");
    const listed = await request("/api/account/sessions", undefined, first.cookie);
    const body = (await listed.json()) as { sessions: { id: string; current: boolean }[] };
    expect(body.sessions).toHaveLength(2);
    expect(JSON.stringify(body)).not.toMatch(/token|userAgent|ipAddress/);
    await request("/api/account/revoke", { sessionId: body.sessions[0]?.id }, foreign.cookie);
    expect((await request("/api/account", undefined, second.cookie)).status).toBe(200);
    const recovered = await login("adult@example.com", true);
    expect((await request("/api/account", undefined, first.cookie)).status).toBe(401);
    expect((await request("/api/account", undefined, second.cookie)).status).toBe(401);
    await request("/api/account/revoke", { all: true }, recovered.cookie);
    expect((await request("/api/account", undefined, recovered.cookie)).status).toBe(401);
    expect((await request("/api/account", undefined, foreign.cookie)).status).toBe(200);
  });
  it("enforces idle/absolute/fresh lifetimes and deletes all account state", async () => {
    const first = await login();
    database.raw
      .prepare("UPDATE auth_session SET updatedAt = ?")
      .run(new Date(Date.now() - AUTH_IDLE * 1000 - 1).toISOString());
    expect((await request("/api/account", undefined, first.cookie)).status).toBe(401);
    const second = await login();
    database.raw
      .prepare("UPDATE auth_session SET createdAt = ?")
      .run(new Date(Date.now() - 301000).toISOString());
    expect(
      (await request("/api/account/delete", { confirmation: "DELETE" }, second.cookie)).status,
    ).toBe(403);
    const third = await login();
    await request("/api/account/categories", { category: "touch", approved: true }, third.cookie);
    expect(
      (await request("/api/account/delete", { confirmation: "DELETE" }, third.cookie)).status,
    ).toBe(200);
    for (const table of [
      "auth_user",
      "auth_session",
      "auth_account",
      "account_declarations",
      "account_category_approvals",
      "users",
      "auth_verification",
    ])
      expect(database.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    expect(database.raw.prepare("SELECT count(*) AS n FROM account_deletions").get()).toEqual({
      n: 1,
    });
    expect((await request("/api/account", undefined, third.cookie)).status).toBe(401);
  });
  it("withdraws categories and adult access and never accepts forged verification", async () => {
    const { cookie } = await login();
    expect(
      (await request("/api/account/categories", { category: "touch", approved: true }, cookie))
        .status,
    ).toBe(200);
    await request("/api/account/adulthood", { adult: false }, cookie);
    expect((await request("/api/account", undefined, cookie)).status).toBe(200);
    expect(
      (await request("/api/account/categories", { category: "touch", approved: true }, cookie))
        .status,
    ).toBe(403);
    expect(
      (await request("/api/account/age-verification/callback", { over18: true }, cookie)).status,
    ).toBe(503);
    expect(database.raw.prepare("SELECT count(*) AS n FROM adult_access").get()).toEqual({ n: 0 });
  });
  it("has atomic send budgets without storing raw addresses; no transport means no registration", async () => {
    const responses = await Promise.all(
      [1, 2, 3, 4, 5].map(() =>
        request("/api/auth/email-otp/send-verification-otp", {
          email: "adult@example.com",
          adult: true,
        }),
      ),
    );
    expect(responses.filter((r) => r.status === 200)).toHaveLength(3);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(2);
    expect(JSON.stringify(database.raw.prepare("SELECT * FROM auth_budgets").all())).not.toContain(
      "adult@example.com",
    );
    delete env.AUTH_TEST_DELIVER;
    expect(
      (
        await request("/api/auth/email-otp/send-verification-otp", {
          email: "other@example.com",
          adult: true,
        })
      ).status,
    ).toBe(503);
    expect(database.raw.prepare("SELECT count(*) AS n FROM auth_user").get()).toEqual({ n: 0 });
  });
});

describe("capacity and session expiry", () => {
  it("expires sessions absolutely and never restores a revoked session through reads", async () => {
    const { cookie } = await login();
    database.raw
      .prepare("UPDATE auth_session SET expiresAt = ?")
      .run(new Date(Date.now() - 1).toISOString());
    expect((await request("/api/account", undefined, cookie)).status).toBe(401);
    expect(database.raw.prepare("SELECT count(*) AS n FROM auth_session").get()).toEqual({ n: 0 });
  });
  it("bounds global email volume atomically and fails closed on provider failure", async () => {
    const { reserveEmailVolume } = await import("../../src/services/account");
    const day = new Date().toISOString().slice(0, 10);
    database.raw.prepare("INSERT INTO auth_email_volume VALUES (?,98)").run(`day:${day}`);
    const reservations = await Promise.all([1, 2, 3, 4].map(() => reserveEmailVolume(database.db)));
    expect(reservations.filter(Boolean)).toHaveLength(2);
    database.raw.prepare("DELETE FROM auth_email_volume").run();
    database.raw
      .prepare("INSERT INTO auth_email_volume VALUES (?,1000)")
      .run(`month:${day.slice(0, 7)}`);
    expect(await reserveEmailVolume(database.db)).toBe(false);
    env.AUTH_TEST_DELIVER = async () => {
      throw new Error("synthetic provider refusal");
    };
    const failed = await request("/api/auth/email-otp/send-verification-otp", {
      email: "adult@example.com",
      adult: true,
    });
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "email_unavailable" });
  });
});
