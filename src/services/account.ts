import type { Bindings } from "../server/bindings";
import { AUTH_IDLE, createIdentity, type Identity } from "./auth";

export function accountOrigin(env: Bindings): string {
  return env.APP_ENV === "production" ? "https://cheapseggs.com" : "http://127.0.0.1:8787";
}
export function identityReady(env: Bindings): boolean {
  return Boolean(env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.length >= 32);
}
export function emailReady(env: Bindings): boolean {
  return (
    identityReady(env) &&
    ((env.APP_ENV !== "production" && Boolean(env.AUTH_TEST_DELIVER)) ||
      (env.AUTH_EMAIL_ENABLED === "true" &&
        Boolean(env.ACCOUNT_EMAIL) &&
        env.AUTH_EMAIL_FROM === "accounts@cheapseggs.com"))
  );
}
export function identityFor(env: Bindings, onDelivered?: () => void): Identity {
  if (!identityReady(env)) throw new Error("identity_unavailable");
  return createIdentity(
    env.DB,
    env.BETTER_AUTH_SECRET as string,
    accountOrigin(env),
    async (data) => {
      if (!emailReady(env)) throw new Error("email_unavailable");
      if (env.APP_ENV !== "production" && env.AUTH_TEST_DELIVER) {
        await env.AUTH_TEST_DELIVER(data);
        onDelivered?.();
        return;
      }
      if (!env.ACCOUNT_EMAIL || !(await reserveEmailVolume(env.DB)))
        throw new Error("email_capacity_reached");
      await env.ACCOUNT_EMAIL.send({
        from: "accounts@cheapseggs.com",
        to: data.email,
        subject: "Your CheapSeggs account code",
        text: `Your CheapSeggs account code is ${data.otp}. It expires in 10 minutes. Enter it only on cheapseggs.com. If you did not request this code, ignore this email.`,
      });
      onDelivered?.();
    },
  );
}

/** Keyed abuse fingerprints, never auth tokens. Fixed 15-minute windows; fail closed on D1 errors. */
export async function takeBudget(
  env: Bindings,
  scope: string,
  value: string,
  limit: number,
): Promise<boolean> {
  const now = Date.now();
  const window = Math.floor(now / 900000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.BETTER_AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`auth-budget-v1:${scope}:${window}:${value}`),
  );
  const digest = Array.from(new Uint8Array(signature), (x) => x.toString(16).padStart(2, "0")).join(
    "",
  );
  const row = await env.DB.prepare(`INSERT INTO auth_budgets(key,count,expires_at) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`)
    .bind(digest, (window + 1) * 900000)
    .first<{ count: number }>();
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM auth_budgets WHERE key IN (SELECT key FROM auth_budgets WHERE expires_at <= ? LIMIT 100)",
    ).bind(now),
    env.DB.prepare(
      "DELETE FROM auth_verification WHERE id IN (SELECT id FROM auth_verification WHERE expiresAt <= ? LIMIT 100)",
    ).bind(new Date(now).toISOString()),
    env.DB.prepare(
      "DELETE FROM auth_session WHERE id IN (SELECT id FROM auth_session WHERE expiresAt <= ? OR updatedAt <= ? LIMIT 100)",
    ).bind(new Date(now).toISOString(), new Date(now - AUTH_IDLE * 1000).toISOString()),
  ]);
  return Boolean(row && row.count <= limit);
}

export async function currentAccount(env: Bindings, request: Request) {
  if (!identityReady(env)) return null;
  // Primary D1 binding, no read replication or cookie/secondary authorization cache.
  const auth = identityFor(env);
  const resolved = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  if (!resolved?.user.emailVerified) return null;
  const now = Date.now();
  if (now - resolved.session.updatedAt.getTime() >= AUTH_IDLE * 1000) {
    await env.DB.prepare("DELETE FROM auth_session WHERE id = ? AND userId = ?")
      .bind(resolved.session.id, resolved.user.id)
      .run();
    return null;
  }
  const owner = await env.DB.prepare(
    "SELECT id FROM users WHERE auth_subject = ? AND deletion_requested_at IS NULL",
  )
    .bind(resolved.user.id)
    .first<{ id: string }>();
  if (!owner) return null;
  // A concurrent revoke cannot recreate a deleted row. Auth framework dates are ISO strings.
  const touched = await env.DB.prepare(
    "UPDATE auth_session SET updatedAt = ? WHERE id = ? AND userId = ? AND expiresAt > ? RETURNING id",
  )
    .bind(
      new Date(now).toISOString(),
      resolved.session.id,
      resolved.user.id,
      new Date(now).toISOString(),
    )
    .first();
  return touched ? { ...resolved, ownerId: owner.id, auth } : null;
}

/** Conservative deployment-wide caps: 100/day and 1,000/calendar month. Failed sends count. */
export async function reserveEmailVolume(db: D1Database): Promise<boolean> {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  for (const [key, limit] of [
    [`day:${day}`, 100],
    [`month:${month}`, 1000],
  ] as const) {
    const row = await db
      .prepare(`INSERT INTO auth_email_volume(period,count) VALUES (?,1)
      ON CONFLICT(period) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count`)
      .bind(key, limit)
      .first();
    if (!row) return false;
  }
  await db
    .prepare("DELETE FROM auth_email_volume WHERE period < ? AND period LIKE 'day:%'")
    .bind(`day:${new Date(now.getTime() - 32 * 86400000).toISOString().slice(0, 10)}`)
    .run();
  return true;
}
