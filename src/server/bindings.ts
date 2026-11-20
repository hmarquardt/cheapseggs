export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV: string;
  DEPLOY_REVISION?: string;
  WORKER_VERSION?: { id: string; tag: string; timestamp: string };
  /**
   * HMAC key for spin idempotency fingerprints (`wrangler secret put SPIN_DIGEST_KEY`).
   * Absent or shorter than 32 characters, the Worker falls back to an unkeyed hash and
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
};
