import { type BetterAuthOptions, betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins/email-otp";

export const ADULT_POLICY = "adult-self-declaration-2026-11-20";
export const AUTH_LIFETIME = 7 * 86400;
export const AUTH_IDLE = 86400;
export const AUTH_FRESH = 300;
export type AuthDatabase = NonNullable<BetterAuthOptions["database"]>;
export type DeliverCode = (data: { email: string; otp: string }) => Promise<void>;

/** Shared by production and the pinned framework's SQL generator. No custom credentials. */
export function createIdentity(
  database: AuthDatabase,
  secret: string,
  origin: string,
  deliver: DeliverCode,
) {
  return betterAuth({
    appName: "CheapSeggs",
    baseURL: origin,
    basePath: "/api/auth",
    secret,
    database,
    trustedOrigins: [origin],
    logger: { disabled: true },
    user: {
      modelName: "auth_user",
      deleteUser: { enabled: true },
      changeEmail: { enabled: false },
    },
    account: { modelName: "auth_account", accountLinking: { enabled: false } },
    verification: { modelName: "auth_verification" },
    session: {
      modelName: "auth_session",
      expiresIn: AUTH_LIFETIME,
      freshAge: AUTH_FRESH,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    // Application budgets are atomic, keyed and expiring; no raw IP/email rate records.
    rateLimit: { enabled: false },
    advanced: {
      useSecureCookies: origin.startsWith("https:"),
      cookies: {
        session_token: {
          name: origin.startsWith("https:") ? "__Host-cheapseggs.session" : "cheapseggs.session",
          attributes: {
            httpOnly: true,
            secure: origin.startsWith("https:"),
            sameSite: "lax",
            path: "/",
          },
        },
      },
      ipAddress: { disableIpTracking: true },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => ({ data: { ...session, ipAddress: null, userAgent: null } }),
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 8,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: "encrypted",
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== "sign-in") throw new Error("unsupported_email_flow");
          await deliver({ email, otp });
        },
      }),
    ],
  });
}
export type Identity = ReturnType<typeof createIdentity>;
