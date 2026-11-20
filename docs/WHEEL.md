# Wheel of Misfortune — M2 guest Discovery Mode

Status: **implemented and released** (milestone M2, 2026-11-20). Discovery Mode only. This
document is the module specification, the consent/privacy contract and the record of what is
deliberately still missing.

## Scope of this milestone

| In scope                                                        | Not in this milestone                         |
| --------------------------------------------------------------- | --------------------------------------------- |
| One curated, versioned, non-explicit Discovery catalog          | Mutual / Solo modes, partner matching         |
| Server-side eligibility filtering and authoritative selection   | Accounts, authentication, sessions, identity  |
| Heat, experimentation, energy, time, setting, supplies ceilings | Chemistry Check, assessments, recipes         |
| Category opt-ins and hard exclusions                            | Payments, entitlements, content packs         |
| A polished, accessible, mobile-first wheel                      | UGC, chat, photos, AI                         |
| Guest sessions with a 24-hour TTL and explicit reset            | Saved favourites, history, cross-device state |

A spin is a **discovery prompt**. It is never permission, an obligation, a dare or an approval.
Every response carries `result.mode = "discovery-prompt-not-consent"` and the interface says the
same thing in words next to the result.

## Content gate

- Published entries are limited to heat 0–2 (mild, medium, spicy) and are non-graphic:
  flirtation and proximity, never explicit acts.
- Six heat-3 entries exist in the source as `draft`. They are never linked to a published wheel
  segment, never counted in the API, and `scripts/build-seeds.ts` fails if a draft appears on the
  wheel or a published entry exceeds the gate.
- The build also rejects obvious explicit vocabulary in public copy and enforces
  id/title/description/duration bounds, unique ids, duration limits and preview rules.
- **This is an editorial lint, not a professional content review.** A reviewed adult catalog,
  market/age-assurance clearance and the content-review gate in [Security](SECURITY.md) are still
  required before heat 3 or explicit material is published. The public wheel deliberately does not
  wait for that; it does not claim to have passed it either.

## Catalog pipeline

```text
src/content/discovery/catalog.ts      typed editorial source (immutable versions)
        │  npm run seeds:build         validate + compile, 50 versions
        ▼
seeds/local.sql, seeds/production.sql idempotent seed SQL (committed)
        │  wrangler d1 execute
        ▼
D1: categories, activities, activity_versions, wheels, wheel_segments
        │  loadWheelCatalog()          validate every row at read time
        ▼
Worker: eligibility → selection → response
```

- Versions are immutable. Published activity rows are inserted with `INSERT OR IGNORE`, so editing
  copy without a new `version` cannot rewrite a live row — it simply does not take effect, and the
  drift check fails the build.
- Category taxonomy is the exception: `title` and `required_opt_in` are **upserted**. A stale
  `required_opt_in = 0` in an existing database would silently serve consent-prefixed material
  without an opt-in, so this value must follow source.
- `npm run seeds:check` (part of `npm run check`) fails when the committed seeds do not match the
  editorial source.
- `loadWheelCatalog()` reads fresh on every request (no stale authorization cache), drops any row
  that is not `published` or fails schema validation, and derives each activity's required opt-ins
  from the **database** flag — a metadata omission cannot bypass the category opt-in.

## Wheel configuration

Each dimension is independent; heat is an upper bound, never a permission bundle.

| Input            | Values                                         | Default      |
| ---------------- | ---------------------------------------------- | ------------ |
| Heat ceiling     | mild 0, medium 1, spicy 2, habanero 3 (locked) | mild         |
| Experimentation  | classic 0, curious 1, adventurous 2            | classic      |
| Energy           | low 0, moderate 1, high 2                      | moderate     |
| Time budget      | quickie 10, 30 min, hour, all evening (240)    | 30 minutes   |
| Setting          | home, hotel, getaway, other private            | home         |
| Supplies         | household vocabulary, multi-select             | none         |
| Category opt-ins | touch, senses, fantasy (required opt-in)       | **all off**  |
| Hard no          | any category                                   | none         |
| Repeat policy    | avoid recent results / allow                   | avoid recent |

The defaults are the least permissive configuration: no category opt-in is preselected, no supply
is assumed and mild heat is the ceiling. Habanero is shown but disabled because no reviewed heat-3
content is published; the API reports real per-category availability instead of pretending the

## Selection

`POST /api/v1/spins` is the only source of a result. The browser never supplies an eligible list,
a random seed, a weight or a winning index.

1. **Validate** the body with a strict Zod object (no unknown keys, bounded arrays, fixed UUID
   idempotency key, ≤4 KiB body, JSON content type, same-origin).
2. **Load** the published wheel and its exact activity versions from D1.
3. **Filter** with the shared `eligibleActivities()` policy: published status, heat,
   experimentation, energy, duration, environment, supplies, required opt-ins, excluded
   categories, excluded activities and pack access (`null` here).
4. **Apply the repeat policy** as a _variety_ filter: drop results this guest saw recently, but
   fall back to the same eligible pool if that would leave nothing. This never widens a boundary;
   heat, time, supplies, opt-ins and exclusions are untouched.
5. **Draw the winner** with `selectWeighted()` over the whole candidate pool using
   `crypto.getRandomValues` and rejection sampling (no modulo bias). The wheel is uniform today
   (`wheel_segments.weight = 1`); positive weights are supported and tested for a reviewed wheel
   that wants them.
6. **Build a shortlist** of `min(8, pool)` activities that always contains the winner, sampled
   without replacement and then shuffled. Because the shortlist is uniform and independent of the
   winner, the probability of any activity winning is exactly `weight / totalWeight` — unchanged by
   the small wheel.
7. **Persist** the result under the idempotency key, then respond. The animation in the browser
   reveals a decision that already happened.

Property tests assert the exact weighted distribution (16,000 draws, ±0.03), uniformity over seven
activities (chi-square, p < 0.001), winner membership, shortlist uniqueness, the empty-pool case
and the unchanged-boundary fallback.

### Idempotency and revocation

- The client generates one UUID per spin attempt and reuses it on retry.
- A repeat with the same session and the same request fingerprint returns the stored result
  (`replayed: true`) and rebuilds a fresh wheel around it.
- The same key with a **different** digest, or from a different guest session, is rejected with
  `409 spin_conflict`.
- A replay revalidates the catalog: if the stored activity or wheel version has been withdrawn, the
  response is `409 spin_invalidated`. A previously authorized result never bypasses a withdrawal.
- Concurrent duplicates resolve to one row: the loser of the insert race re-reads the winning row
  and returns the same activity.

**The fingerprint is keyed.** It is `HMAC-SHA-256(SPIN_DIGEST_KEY, domain ‖ canonicalRequest)`, not a
plain hash. The preimage is the boundary configuration, whose input space is small: roughly 1.2k
ceiling combinations, 2^8 category exclusion sets and 2^5 supply sets. A database reader could
otherwise test candidates offline and recover heat, opt-ins and hard-NOs for a 24-hour row, which is
exactly the data this project promises not to keep. With a key, the stored value only proves
"same request" to someone who holds the key. `GET /api/version` reports `spinDigestKeyed` and the
production release check fails if it is `false`; without a key the Worker still serves spins with a
domain-separated unkeyed hash rather than refusing service. Rotating the key (or deploying new
digest logic) invalidates 24 hours of in-flight replays, which surfaces as the honest `409
spin_conflict` the client already handles.

### Empty pools and hints

The server returns `status: "empty"` with a neutral message and, where it helps, up to three
**user-initiated** suggestions computed by a bounded search over one or two ceiling changes ("heat
to Medium and experimentation to Curious · +6 ideas"). Nothing is relaxed automatically, and
opt-ins or exclusions are never suggested.

## Guest session and retention

| Property      | Behaviour                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Identifier    | 32 random bytes (hex), proposed by the browser, sent as `x-cheapseggs-guest`                                                         |
| Storage       | Browser memory only — no cookie, no localStorage, no sessionStorage                                                                  |
| Server TTL    | 24 hours from first use; expired rows are purged in bounded batches                                                                  |
| Stored fields | session id, timestamps, a keyed HMAC fingerprint of the normalized request, the wheel and activity version, catalog revision, expiry |
| Never stored  | heat, experimentation, energy, time, setting, supplies, opt-ins, exclusions, answers, performed activities                           |
| Budget        | 200 spins per session, then `429 guest_budget_exhausted`                                                                             |
| Reset         | `DELETE /api/v1/guest` deletes the session and cascades its spins                                                                    |
| Analytics     | none: `/play/` is not an allowlisted analytics path and no event is emitted                                                          |

A client-proposed nonce is used instead of a server-issued token so a double-tapped spin can carry
the same identity in both in-flight requests; the server upserts it under its own TTL and never
trusts it for anything but its own idempotency and variety rows.

Expiry is enforced on read (`expires_at > now`) and cleaned opportunistically: every spin purges up
to 200 expired spins and sessions. There is no scheduled job, so a site with no traffic keeps its
expired rows until the next spin; they are unreadable in the meantime and cascade-delete with their
session.

## Abuse protection

Two Cloudflare-native rate limit bindings sit in front of the public endpoints, configured in
`wrangler.jsonc`/`wrangler.production.jsonc` and asserted by `npm run config:check`:

| Binding              | Endpoint                    | Production limit | Key                 |
| -------------------- | --------------------------- | ---------------- | ------------------- |
| `SPIN_RATE_LIMITER`  | `POST /api/v1/spins`        | 40 / 60 s        | `spin` + client IP  |
| `WHEEL_RATE_LIMITER` | `GET /api/v1/wheels/:wheel` | 120 / 60 s       | `wheel` + client IP |

Properties and limits, stated plainly:

- Counters live in Cloudflare's rate limiting infrastructure, keyed by the client address; nothing
  about the visitor is written to D1 and no identifier is logged.
- Limits are **approximate and per Cloudflare location**: counts update in the background and a
  client hitting several locations gets the limit in each. This is a speed bump against bulk
  automation, not a security control.
- The check fails open. If the binding is missing or errors, spins continue and the per-session
  budget (200) plus the 4 KiB body cap remain.
- 40 spins/minute is far above human use and still allows a shared household address through a
  burst; a stricter edge rule can be added later without changing the Worker.
- Exceeding it returns `429 {"error":"rate_limited"}` with `retry-after: 60`, and the interface says
  the lounge is busy rather than failing silently.
- Local development uses deliberately loose limits (300/600) so browser tests are not coupled to the
  limiter.

## Interface contract

- Retro-casino marquee, SVG wheel with labelled wedges, bulbs and a fixed pointer. Before the first
  spin the disc shows eight dim placeholder wedges and a `SPIN` hub instead of an empty circle.
- Wedge captions are radial, anchored at the rim and flipped on the left half so none of them reads
  upside down; they never cross into a neighbouring wedge. The geometry is asserted in a browser
  test (captions inside the rim, the wedge under the pointer equals the winner marked in the list).
- The wheel is decorative (`aria-hidden`); an ordered list next to it states the same shortlist in
  words and marks the winner with `aria-current`.
- `prefers-reduced-motion: reduce` skips the spin entirely (0 ms) and announces the result
  immediately; the CSS also disables the bulb animation.
- Sound is off by default, synthesised locally with Web Audio, never autoplays and can be switched
  off again at any time. When it is on, the spin plays decelerating ticks and a two-note landing;
  every timer is cancelled when the spin ends, restarts or the page is left.
- Focus moves to the result heading after each spin; the spin button is a real button (keyboard and
  switch-accessible) and the live region reports state.
- Every result shows category, heat, duration, energy, preparation, supplies, accessibility
  adaptations and safety notes, plus "Spin again" and "Not tonight".
- "Not tonight" hides that idea for the session (an ordinary exclusion, undoable).
- An empty pool is explained in place; no fake or placeholder result is ever shown.

## Tests

| Layer                                                            | Coverage                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                                                             | Request validation, context mapping, digest canonicalization, keyed vs unkeyed fingerprint, variety fallback, selection distribution/weights, shortlist invariants, caption clipping                                                                                                                                                                                                                              |
| Integration (`node:sqlite` + real migrations/seeds through Hono) | Catalog endpoint, opt-in/exclusion/heat filtering, draft exclusion, replay, changed digest, concurrent duplicates, foreign session, withdrawal invalidation, empty pool + hints, session reuse, 24h expiry, reset, budget, invalid/cross-site input, stored fingerprint keying, rate-limited 429 before guest state exists, fail-open limiter, result/wedge identity, repeat avoidance that cannot widen the pool |
| Browser                                                          | Acknowledgement, focus order, reduced-motion instant result, readable alternative, hide/undo/clear, keyboard-only spin, empty-menu message, axe on landing/lounge/privacy/result, no storage or cookies, desktop + iPhone viewports                                                                                                                                                                               |

## Known limitations

- Catalog content is editorial, not professionally reviewed; heat 3 is unpublished.
- Habanero is visible but locked, so `heat = 3` returns the same pool as spicy.
- Guest state is per-tab-memory: a reload starts a new session (the old rows expire).
- Anti-automation is approximate: per-location Cloudflare rate limits plus the per-session budget.
  Neither stops a determined distributed attacker, and a shared address can exhaust the spin limit
  for its neighbours until the minute rolls over.
- No analytics for spins, deliberately; this milestone's product metrics require local moderated
  adult testing, which remains outstanding.
