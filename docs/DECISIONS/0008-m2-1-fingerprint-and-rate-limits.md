# ADR 0008 — Keyed spin fingerprints and Cloudflare-native rate limiting

Status: accepted and implemented in M2.1 (2026-11-20). Refines [ADR 0007](0007-m2-guest-wheel.md);
it does not change the content gate, server-only selection or the guest-session model.

Context: M2 shipped with two claims that did not survive review.

1. The guest wheel persisted `SHA-256(canonicalRequest)` as its idempotency value and described it
   as harmless. The preimage is a boundary configuration: 4 heat x 3 experimentation x 3 energy x
   4 duration x 4 environment x 2 repeat policies, 2^5 supply sets, 2^8 category exclusion sets and
   an activity exclusion list. That is small enough to enumerate offline, so a database or backup
   reader could recover heat, opt-ins and hard-NOs for a 24-hour row — the exact data the project
   promises not to store.
2. "200 spins per session" was described as abuse protection. Anonymous clients mint sessions, so it
   bounded nothing global.

Decision:

1. **Key the fingerprint.** `HMAC-SHA-256(SPIN_DIGEST_KEY, "cheapseggs.spin.v1" ‖ canonical)`.
   The key is a Worker secret set once with `wrangler secret put`, which survives deploys. The
   stored value then only proves "same request" to a holder of the key; replay, changed-request
   conflict and concurrent-duplicate behaviour are unchanged.
2. **Degrade visibly, never silently.** Without a 32+ character key the Worker falls back to a
   domain-separated unkeyed hash instead of refusing spins, and `GET /api/version` reports
   `spinDigestKeyed`. The production release check fails on `false`, so the weaker state cannot be
   shipped as a success — and it never becomes an outage if a secret is lost.
3. **Accept deploy-time replay loss.** Rotating the key or shipping new digest logic makes the last
   24 h of fingerprints unmatchable. In-flight retries receive `409 spin_conflict`, which the
   interface already explains, rather than a wrong result.
4. **Rate limit with the platform primitive.** Two `ratelimits` bindings (40/min spins, 120/min wheel
   config, keyed by client address) replace the "distributed rate limiting" gate with something that
   costs nothing extra, stores nothing in D1 and needs no new service. It is documented as an
   approximate, per-location speed bump that fails open; the per-session budget and 4 KiB body cap
   remain the backstop.

Alternatives rejected: keeping the unkeyed digest and documenting it as low risk (the inference is
demonstrable, not theoretical); storing encrypted request bodies (worse: same exposure, more code);
removing idempotency validation entirely (loses the changed-request conflict and the honest 409);
Durable Objects or KV counters (a new paid service and a custom limiter for a single-route speed
bump); Cloudflare WAF rate limiting rules (needs zone-level rule management we cannot verify from
the repository, and would live outside the reviewed config).

Consequences: one more Worker secret to provision and rotate, a release gate on a configuration
value, and an approximation that a determined distributed attacker can still work around. In
exchange, the persisted guest row no longer leaks the boundary configuration, and the public
endpoints have a platform-enforced ceiling that is visible in configuration review.
