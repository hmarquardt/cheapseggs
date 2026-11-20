import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  accountOrigin,
  currentAccount,
  emailReady,
  identityFor,
  identityReady,
  takeBudget,
} from "../services/account";
import { ADULT_POLICY, AUTH_FRESH } from "../services/auth";
import type { Bindings } from "./bindings";

export const accountRoutes = new Hono<{ Bindings: Bindings }>();
const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const codeBody = z.object({ email, adult: z.literal(true) }).strict();
const signInBody = codeBody
  .extend({ otp: z.string().regex(/^\d{8}$/), recovery: z.boolean().default(false) })
  .strict();

const guards = new Hono<{ Bindings: Bindings }>();
guards.use(
  "*",
  bodyLimit({ maxSize: 4096, onError: (c) => c.json({ error: "body_too_large" }, 413) }),
);
guards.use("*", async (c, next) => {
  if (!c.env) return c.json({ error: "auth_not_configured" }, 503);
  if (c.req.method !== "GET") {
    const site = c.req.header("sec-fetch-site");
    if (
      c.req.header("origin") !== accountOrigin(c.env) ||
      (site && site !== "same-origin") ||
      c.req.header("content-type")?.split(";")[0] !== "application/json" ||
      c.req.header("x-cheapseggs-action") !== "account"
    ) {
      return c.json({ error: "request_not_allowed" }, 403);
    }
  }
  if (c.req.path.endsWith("/status")) return next();
  if (!identityReady(c.env)) return c.json({ error: "auth_not_configured" }, 503);
  // The edge overwrites CF-Connecting-IP; local tooling shares a single conservative budget.
  const address = c.env.APP_ENV === "production" ? c.req.header("cf-connecting-ip") : "local";
  if (!address) return c.json({ error: "unavailable" }, 503);
  if (!(await takeBudget(c.env, "request", address, 180))) {
    c.header("retry-after", "900");
    return c.json({ error: "rate_limited" }, 429);
  }
  await next();
});
accountRoutes.route("/api/auth", guards);
accountRoutes.route("/api/account", guards);
accountRoutes.get("/api/account/status", (c) =>
  c.json({
    emailSignInAvailable: emailReady(c.env),
    ageVerificationAvailable: false,
    restrictedContentAvailable: false,
  }),
);

// No direct framework catch-all: expose only deliberately reviewed operations.
accountRoutes.post("/api/auth/email-otp/send-verification-otp", async (c) => {
  if (!emailReady(c.env)) return c.json({ error: "email_not_configured" }, 503);
  const parsed = codeBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
  if (
    !(await takeBudget(c.env, "email-send", parsed.data.email, 3)) ||
    !(await takeBudget(c.env, "network-send", c.req.header("cf-connecting-ip") ?? "local", 10))
  ) {
    c.header("retry-after", "900");
    return c.json({ error: "rate_limited" }, 429);
  }
  let delivered = false;
  try {
    await identityFor(c.env, () => {
      delivered = true;
    }).api.sendVerificationOTP({
      body: { email: parsed.data.email, type: "sign-in" },
    });
  } catch {
    return c.json({ error: "email_unavailable" }, 503);
  }
  // Better Auth intentionally catches email-task errors; require observed transport acceptance.
  if (!delivered) return c.json({ error: "email_unavailable" }, 503);
  return c.json({ ok: true });
});
accountRoutes.post("/api/auth/sign-in/email-otp", async (c) => {
  if (!emailReady(c.env)) return c.json({ error: "email_not_configured" }, 503);
  const parsed = signInBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
  if (!(await takeBudget(c.env, "email-verify", parsed.data.email, 15)))
    return c.json({ error: "rate_limited" }, 429);
  const { email, otp, recovery } = parsed.data;
  const previous = await currentAccount(c.env, c.req.raw);
  const response = await identityFor(c.env).handler(
    new Request(`${accountOrigin(c.env)}/api/auth/sign-in/email-otp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: accountOrigin(c.env) },
      body: JSON.stringify({ email, otp }),
    }),
  );
  if (!response.ok) return c.json({ error: "invalid_or_expired_code" }, 400);
  const result = (await response.json()) as { token: string; user: { id: string } };
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO account_declarations(user_id,policy_version,declared_at,expires_at) VALUES (?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET policy_version=excluded.policy_version,declared_at=excluded.declared_at,expires_at=excluded.expires_at`).bind(
      result.user.id,
      ADULT_POLICY,
      now,
      now + 365 * 86400,
    ),
    // Reauthentication replaces this browser's old session; explicit recovery also ends other devices.
    recovery
      ? c.env.DB.prepare("DELETE FROM auth_session WHERE userId = ? AND token <> ?").bind(
          result.user.id,
          result.token,
        )
      : c.env.DB.prepare("DELETE FROM auth_session WHERE id = ? AND userId = ?").bind(
          previous?.session.id ?? "",
          previous?.user.id ?? "",
        ),
  ]);
  for (const cookie of response.headers.getSetCookie())
    c.header("set-cookie", cookie, { append: true });
  return c.json({ ok: true });
});

accountRoutes.get("/api/account", async (c) => {
  const account = await currentAccount(c.env, c.req.raw);
  if (!account) return c.json({ error: "sign_in_required" }, 401);
  const declaration = await c.env.DB.prepare(
    "SELECT policy_version, expires_at FROM account_declarations WHERE user_id = ?",
  )
    .bind(account.ownerId)
    .first<{ policy_version: string; expires_at: number }>();
  const selfDeclared =
    declaration?.policy_version === ADULT_POLICY && declaration.expires_at > Date.now() / 1000;
  const approvals = await c.env.DB.prepare(
    "SELECT category_id FROM account_category_approvals WHERE user_id = ? AND policy_version = ? ORDER BY category_id",
  )
    .bind(account.ownerId, ADULT_POLICY)
    .all<{ category_id: string }>();
  return c.json({
    email: account.user.email,
    state: selfDeclared ? "registered_self_declared_adult" : "registered",
    emailVerified: true,
    adultStatus: { selfDeclared, independentlyVerified: false },
    categoryApprovals: approvals.results.map((row) => row.category_id),
    freshAuthentication: Date.now() - account.session.createdAt.getTime() < AUTH_FRESH * 1000,
    restrictedContentAvailable: false,
  });
});
accountRoutes.get("/api/account/sessions", async (c) => {
  const account = await currentAccount(c.env, c.req.raw);
  if (!account) return c.json({ error: "sign_in_required" }, 401);
  const { results } = await c.env.DB.prepare(
    "SELECT id, createdAt, expiresAt FROM auth_session WHERE userId = ? AND expiresAt > ? AND updatedAt > ? ORDER BY createdAt DESC LIMIT 50",
  )
    .bind(account.user.id, new Date().toISOString(), new Date(Date.now() - 86400000).toISOString())
    .all<{ id: string; createdAt: string; expiresAt: string }>();
  return c.json({
    sessions: results.map((row) => ({
      id: row.id,
      createdAt: new Date(row.createdAt).getTime(),
      expiresAt: new Date(row.expiresAt).getTime(),
      current: row.id === account.session.id,
    })),
  });
});
accountRoutes.post("/api/account/revoke", async (c) => {
  const account = await currentAccount(c.env, c.req.raw);
  if (!account) return c.json({ error: "sign_in_required" }, 401);
  const parsed = z
    .object({ sessionId: z.string().min(1).max(128).optional(), all: z.boolean().optional() })
    .strict()
    .refine((x) => Boolean(x.sessionId) !== Boolean(x.all))
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
  if (parsed.data.all) await account.auth.api.revokeSessions({ headers: c.req.raw.headers });
  else {
    const row = await c.env.DB.prepare("SELECT token FROM auth_session WHERE id = ? AND userId = ?")
      .bind(parsed.data.sessionId, account.user.id)
      .first<{ token: string }>();
    if (row)
      await account.auth.api.revokeSession({
        headers: c.req.raw.headers,
        body: { token: row.token },
      });
  }
  return c.json({ ok: true });
});
accountRoutes.post("/api/account/delete", async (c) => {
  const account = await currentAccount(c.env, c.req.raw);
  if (!account) return c.json({ error: "sign_in_required" }, 401);
  if (Date.now() - account.session.createdAt.getTime() >= AUTH_FRESH * 1000)
    return c.json({ error: "recent_sign_in_required" }, 403);
  const parsed = z
    .object({ confirmation: z.literal("DELETE") })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "confirmation_required" }, 400);
  const response = await account.auth.api.deleteUser({
    headers: c.req.raw.headers,
    body: {},
    asResponse: true,
  });
  if (!response.ok) return c.json({ error: "deletion_unavailable" }, 503);
  for (const cookie of response.headers.getSetCookie())
    c.header("set-cookie", cookie, { append: true });
  return c.json({ ok: true });
});
accountRoutes.post("/api/auth/sign-out", async (c) => {
  const response = await identityFor(c.env).api.signOut({
    headers: c.req.raw.headers,
    asResponse: true,
  });
  for (const cookie of response.headers.getSetCookie())
    c.header("set-cookie", cookie, { append: true });
  return c.json({ ok: true });
});
accountRoutes.post("/api/account/adulthood", async (c) => {
  const account = await currentAccount(c.env, c.req.raw);
  if (!account) return c.json({ error: "sign_in_required" }, 401);
  const parsed = z
    .object({ adult: z.boolean() })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
  const now = Math.floor(Date.now() / 1000);
  if (parsed.data.adult)
    await c.env.DB.prepare(
      `INSERT INTO account_declarations VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET policy_version=excluded.policy_version,declared_at=excluded.declared_at,expires_at=excluded.expires_at`,
    )
      .bind(account.ownerId, ADULT_POLICY, now, now + 365 * 86400)
      .run();
  else
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM account_declarations WHERE user_id = ?").bind(account.ownerId),
      c.env.DB.prepare("DELETE FROM account_category_approvals WHERE user_id = ?").bind(
        account.ownerId,
      ),
      c.env.DB.prepare("DELETE FROM adult_access WHERE user_id = ?").bind(account.ownerId),
    ]);
  return c.json({ ok: true });
});
// Restricted category collection and real assurance cannot be enabled by client claims.
accountRoutes.all("/api/account/age-verification/*", (c) =>
  c.json({ error: "age_verification_unavailable" }, 503),
);

accountRoutes.post("/api/account/categories", async (c) => {
  const account = await currentAccount(c.env, c.req.raw);
  if (!account) return c.json({ error: "sign_in_required" }, 401);
  const parsed = z
    .object({ category: z.enum(["touch", "senses", "fantasy"]), approved: z.boolean() })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
  const { category, approved } = parsed.data;
  const now = Math.floor(Date.now() / 1000);
  if (approved) {
    // Only existing non-explicit categories can be collected. Atomic current adulthood check.
    const result =
      await c.env.DB.prepare(`INSERT INTO account_category_approvals(user_id,category_id,policy_version,approved_at)
      SELECT user_id,?,?,? FROM account_declarations WHERE user_id = ? AND policy_version = ? AND expires_at > ?
      ON CONFLICT(user_id,category_id) DO UPDATE SET policy_version=excluded.policy_version,approved_at=excluded.approved_at RETURNING user_id`)
        .bind(category, ADULT_POLICY, now, account.ownerId, ADULT_POLICY, now)
        .first();
    if (!result) return c.json({ error: "adult_declaration_required" }, 403);
  } else
    await c.env.DB.prepare(
      "DELETE FROM account_category_approvals WHERE user_id = ? AND category_id = ?",
    )
      .bind(account.ownerId, category)
      .run();
  return c.json({ ok: true });
});
