export type Bindings = {
  DB: D1Database;
  BETTER_AUTH_SECRET?: string;
  AUTH_EMAIL_ENABLED?: string;
  AUTH_EMAIL_FROM?: string;
  ACCOUNT_EMAIL?: SendEmail;
  /** Test-only injected transport; never bound in production. */
  AUTH_TEST_DELIVER?: (data: { email: string; otp: string }) => Promise<void>;
  ASSETS: Fetcher;
  APP_ENV: string;
  DEPLOY_REVISION?: string;
  WORKER_VERSION?: { id: string; tag: string; timestamp: string };
  /**
   * HMAC key for spin idempotency fingerprints (`wrangler secret put SPIN_DIGEST_KEY`).
   * Absent or shorter than 32 characters, spins fail closed and
   * `/api/version` reports it, so a release can refuse to ship that state.
   */
  SPIN_DIGEST_KEY?: string;
  /**
   * Cloudflare-native rate limiting (approximate, per Cloudflare location). Optional at
   * the type level so tests and local tooling can run without the binding; the endpoint
   * fails open rather than breaking a valid spin.
   */
  SPIN_RATE_LIMITER?: RateLimit;
  WHEEL_RATE_LIMITER?: RateLimit;
  /** Private Chemistry Check is closed unless this and the review flag are explicitly set. */
  CHEMISTRY_PRIVATE_ENABLED?: string;
  /** Second, independent switch recorded only after the external security audit approves. */
  CHEMISTRY_PRIVATE_REVIEW_APPROVED?: string;
  /** Base64url 32-byte AES-256-GCM key; never the wheel digest or auth secret. */
  CHEMISTRY_ENVELOPE_KEY?: string;
  CHEMISTRY_ENVELOPE_KEY_VERSION?: string;
  /** JSON object of older key versions kept for decryption during rotation. */
  CHEMISTRY_ENVELOPE_PREVIOUS_KEYS?: string;
};
