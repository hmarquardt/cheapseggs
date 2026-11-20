# ADR 0009 — The spin fingerprint key is mandatory (no unkeyed fallback)

Status: accepted and implemented 2026-11-20. Supersedes decision 2 of [ADR 0008](0008-m2-1-fingerprint-and-rate-limits.md);
every other decision in that ADR stands.

Context: ADR 0008 keyed the persisted spin fingerprint with `SPIN_DIGEST_KEY` but kept an unkeyed
fallback for the case where the secret was absent, on the argument that a visible degradation
(reported by `/api/version` and rejected by the release check) was better than an outage. That
reasoning is wrong for this data class. Visibility protects the _release_ pipeline, not the runtime
between releases: a worker whose secret was lost, truncated, mistyped or never bound would keep
serving spins and keep writing fingerprints of the boundary configuration — the one thing the project
promises not to store. A degraded mode that continues to write the sensitive value is not a
degradation; it is the vulnerability with an alarm attached.

Decision:

1. **No unkeyed mode exists in the code.** `requestDigest` throws when the key is not usable, and the
   only fingerprint it can produce is `HMAC-SHA-256(key, domain ‖ canonical request)`.
2. **Fail closed, early and quietly.** `POST /api/v1/spins` validates the key immediately after the
   database binding check — before rate limiting, body parsing, catalog loading, guest-session
   creation or any spin write — and returns a fixed `503 {"error":"unavailable"}`. The body never
   echoes the key, the request, or which check failed, and nothing is logged.
3. **Define "valid" narrowly.** A key is usable only when it is a string of 32–128 characters from
   `[A-Za-z0-9_-]`. Empty, padded, escaped, multi-line, non-ASCII, over-long or non-string values are
   all "not configured" rather than coerced into a key.
4. **Keep the failure out of the user's way where it can be.** `GET /api/v1/wheels/misfortune` holds
   no fingerprints and keeps answering, so the page still explains itself; the spin itself returns
   the controlled error.
5. **Gate the release on both halves.** `/api/version` reports `spinDigestKeyed` using the same
   validity rule, and the production check fails when it is false _and_ separately requires a live
   spin to return 200 — a keyed configuration that somehow breaks real spins is also a failed
   release.
6. **Local development is not an exception.** `wrangler.jsonc` (local only) declares a documented
   non-secret development key, asserted by `npm run config:check`, so `npm run dev`, the browser
   suite and local D1 all exercise the required-key path. Production config is asserted to contain no
   plaintext `SPIN_DIGEST_KEY` at all.

Alternatives rejected: keeping the fallback behind `APP_ENV !== "production"` (a production-reachable
branch guarded by a string, and a dev/prod divergence that hides the failure locally); returning 500
or throwing (loses the controlled, non-enumerating error); degrading to "no fingerprint, allow the
spin" (silently breaks the replay/conflict contract promised in `docs/API.md`); storing the
fingerprint encrypted with a per-session key (the key would sit in the same row as the ciphertext).

Consequences: the wheel's availability now depends on a secret existing and being well-formed. If it
is lost, spins fail with a clear message while the rest of the site works, and the release check
catches the state before users do — the correct trade for a value we promised not to keep. Rotation
still invalidates ~24 hours of in-flight replays as an honest `409 spin_conflict`.
