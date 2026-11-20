# JSON API contract proposal

## M3A implemented account API (supersedes disabled-auth row above)

GET `/api/account/status` exposes email/assurance/restricted-content availability without identity. GET `/api/account` returns only the current account's email, declaration state and own preview category approvals; GET `/api/account/sessions` returns owner-scoped opaque IDs/times, never bearer tokens. POST `/api/auth/email-otp/send-verification-otp` accepts `{email,adult:true}`; POST `/api/auth/sign-in/email-otp` accepts `{email,adult:true,otp,recovery?}`. Both require strict input, exact Origin, JSON and `X-CheapSeggs-Action: account`. Codes and session tokens never appear in returned JSON.

POST `/api/auth/sign-out`, `/api/account/revoke` (`{sessionId}` or `{all:true}`), `/api/account/delete` (`{confirmation:"DELETE"}`, five-minute freshness), `/api/account/adulthood` (`{adult:boolean}`) and `/api/account/categories` (`{category,approved}` for the three existing non-explicit opt-in categories) are implemented. All are same-origin, bounded, no-store/noindex and owner-only. Age-verification paths return 503. All other framework operations remain inaccessible.

GET `/api/v1/content/:id/:version` checks authoritative publication/access/category/entitlement state and returns generic 404 for forbidden or restricted content; it never exposes protected titles/metadata. No adult activity approval endpoint exists because restricted content remains closed. See AUTH.md and AGE_ASSURANCE.md.

## M3B implemented experience API (2026-11-20)

All experience routes are public, non-explicit, `no-store` and `noindex`. None reads an account cookie, and none returns restricted material.

| Route                           | Behavior                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/v1/wheels`            | Public wheel directory: id, title, tagline, description, draw mode and eligible segment count. No activity content.                                                 |
| GET `/api/v1/wheels/:wheel`     | One published wheel configuration (`misfortune`, `foreplay`, `double-trouble`, `dealers-choice`). Unknown or unpublished ids return 404.                            |
| POST `/api/v1/spins`            | Accepts `wheelId` in the strict schema. Single, compatible-pair and house-category draws are still server-authoritative; a pair is persisted for idempotent replay. |
| GET `/api/v1/date-night`        | Option lists, categories with blurbs, supply vocabulary, published recipe summaries and disclosure copy.                                                            |
| POST `/api/v1/date-night/plans` | Requires the guest nonce, same-origin JSON and a bounded body. Returns a plan or an explicit empty result; `keep[]` re-times around kept steps. Nothing is stored.  |
| POST `/api/v1/date-night/steps` | Rerolls or replaces one step after re-validating every submitted step against the current eligible pool and time budget.                                            |
| GET `/api/v1/recipes`           | Published cookbook summaries.                                                                                                                                       |
| GET `/api/v1/recipes/:id`       | One published recipe with activities and substitutions; 404 for unknown or restricted ids.                                                                          |

Plan steps are validated server-side on every request; there is no client-authoritative eligibility. Unknown category or supply ids return 422. See [Experiences](EXPERIENCES.md).

Choose **REST with OpenAPI 3.1**, same-origin JSON, versioned domain routes under `/api/v1`. REST makes security/resource ownership review and future embedded clients easier than a framework-bound RPC graph. Typed RPC would reduce some client boilerplate but couples transport/types and does not eliminate validation or authorization. Use Zod runtime validation plus generated OpenAPI when the first real mutation is implemented; the foundation has a small checked-in [OpenAPI contract](openapi.json) for implemented routes only. Do not publish speculative endpoints as functioning services.

## Implemented now

| Route                       | Behavior                                                                                                                                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /api/health             | 200 service/stage only; no dependency details                                                                                                                                                                                |
| GET /api/ready              | 200 if local migrated catalog is queryable, otherwise generic 503                                                                                                                                                            |
| GET /api/v1/catalog/preview | At most 12 explicitly public non-intimate free fixture records, fixed DTO, no personal context                                                                                                                               |
| GET /api/v1/wheels          | Public wheel directory (four wheels) with draw modes and segment counts; no activity content.                                                                                                                                |
| GET /api/v1/wheels/:wheel   | One published wheel configuration: catalog counts by heat, categories (including which require opt-in), supply vocabulary, option lists and disclosure text. No visitor or session data.                                     |
| POST /api/v1/spins          | Guest Discovery spin. Strict bounded body, same-origin JSON, server-side eligibility and authoritative result, idempotent per client key, 24h guest TTL, `spins` never accepted from a partner or on another guest's behalf. |
| DELETE /api/v1/guest        | Explicit reset: deletes the presenting guest session and cascades its spins. 204, idempotent, never reveals whether the session existed.                                                                                     |
| /api/auth/*                 | 503 auth_not_configured                                                                                                                                                                                                      |
| /api/payments/*             | 503 payments_not_configured                                                                                                                                                                                                  |
| Other API routes            | 404 not_found; no private CRUD implementation                                                                                                                                                                                |

`GET /api/version` additionally exposes the non-secret Git commit, Worker version and environment for release verification. All API responses are no-store/noindex. Samples are intentionally safe public previews; the real adult catalog must require the market/assurance policy before delivery. Health is not readiness. No D1 query text or internal failure objects returned.

### Guest spin request/response contract (M2, implemented)

`POST /api/v1/spins` requires `content-type: application/json` and the opaque
`x-cheapseggs-guest` nonce (32 random bytes, hex). Body: `wheelId`, `heat`,
`experimentation`, `energy`, `duration`, `environment`, `supplies[]`, `optIns[]`,
`excludedCategories[]`, `excludedActivities[]`, `repeatPolicy`, `idempotencyKey`
(UUID v4). Unknown keys, unknown category/supply ids, bodies over 4 KiB, cross-site
origins and non-JSON requests are rejected before any database write.

Responses: `200 {status:"result"}` with the shortlist, `selectedIndex`, the full
result DTO (`mode: "discovery-prompt-not-consent"`), `eligibleCount` and the guest
expiry; `200 {status:"empty"}` with neutral hints; `400 guest_session_required`;
`409 spin_conflict` / `409 spin_invalidated`; `413`/`415`/`422` for malformed input;
`429 guest_budget_exhausted`; `429 rate_limited` (with `retry-after: 60`) from the
Cloudflare rate limit bindings; `503 unavailable` when the database is down **or when the
required fingerprint key is missing or invalid** (fail closed, nothing persisted, no
configuration echoed). `GET /api/v1/wheels/:wheel` shares the
same `429 rate_limited` shape. See [Wheel](WHEEL.md) for the selection, retention and
accessibility contract.

`GET /api/version` returns `service`, `revision`, `workerVersion`, `environment` and two
non-secret health flags: `spinDigestKeyed` (a valid HMAC key is configured, so spins will
not fail closed) and `rateLimits: {spin, wheel}` (both bindings are bound). The production
release check fails when either is false, so a misconfigured deploy cannot be reported as
green.

## Proposed route surface by release

| Surface          | Method/resource                                                                                        | Boundary                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Identity M1b     | Framework-owned /api/auth routes; GET /api/v1/me; DELETE /me; sessions revoke                          | Verified framework session, fresh auth for sensitive actions; framework-generated schema     |
| Adult access M1b | POST /api/v1/adult-access/verify                                                                       | Minimal vendor assertion, replay/expiry/jurisdiction policy                                  |
| Guest wheel M2   | POST /api/v1/spins                                                                                     | Validated context/mode, server result, idempotency key, adult access, guest TTL if persisted |
| Catalog M2       | GET /api/v1/wheels; GET /activities                                                                    | Bounded published DTO; do not disclose paid/private eligibility information                  |
| Recipes M3       | POST /api/v1/recipes; GET /recipes/:id                                                                 | Owner or active member, current eligibility/version/access                                   |
| Relationship M4  | POST /couples; POST /couples/:id/invitations; POST /invitations/accept; DELETE /couples/:id/membership | Independent identities, explicit accept, atomic slots, immediate unilateral revoke           |
| Preferences M4   | PUT /couples/:id/rounds/:round/answers/me                                                              | Full bounded own deck revision, If-Match/revision, CSRF; no userId field                     |
| Release M4       | POST /couples/:id/rounds/:round/release; GET /couples/:id/shared-discovery                             | Explicit two-party share; no count/progress/single-activity probing/filter endpoint          |
| Saved M3/M4      | POST /saved-experiences; DELETE /saved-experiences/:id                                                 | Own collection; no direct fetch bypass of recipe eligibility                                 |
| Commerce M5      | GET /offers; POST /checkout-intents; GET /purchases/:id; POST /billing/cancel                          | Server prices, buyer only, processor suitability first; no current integration               |
| Media M5         | GET /media/:opaqueId                                                                                   | Current entitlement/membership and asset map; private bucket only                            |
| Payment M5       | Provider-specific POST event route                                                                     | Provider authentication, no browser cookie auth, idempotent durable fulfillment              |

No GET preference-by-user, negative-match, partner exclusions, matching counts, intimate activity history, admin preference browser or arbitrary analytics endpoint. GET never mutates consent or consumes invitation/auth capabilities.

## Planned independent assessment namespace (2026-11-20)

`/api/v1/chemistry-check/` will contain assessment creation, single-use invitation acceptance, own draft/submission, exact-revision release approval, approved report read, withdrawal/deletion and own general-template save/import. It takes no couple ID and creates no relationship. Only self endpoints can read a submission; counterpart access is restricted to the mutually authorized report. Server-derived participant/release/epoch/expiry checks replace couple membership checks for this namespace. No bulk profile comparison, per-question probe, counterpart progress, directional score or private-rule endpoint. Compatibility never supplies activity-approval state. See [Chemistry Check](CHEMISTRY_CHECK.md) for version/disclosure/anti-probing semantics. These are planning routes only; the checked-in OpenAPI and executable handlers remain unchanged.

**Implementation status (2026-11-20):** `/chemistry/` now ships a client-only demonstration. It adds **no** API route and sends no assessment data; the question bank, scorer and report live in `src/content/chemistry` and `src/domain/chemistry.ts`. No OpenAPI change is warranted until the persisted namespace exists.

## Request/security conventions

Require application/json on JSON mutations, body size ceilings, strict Zod objects and enum validation. Server derives principal, active partner, entitlement owner scope, catalog version and consent epoch. Public IDs can be opaque but are not an authorization control. Return fixed DTOs rather than serializing rows; generic 404 for unauthorized private resources, 401 for no session, 409 for stale version without partner-specific reasons, 422 invalid own input, 429 bounded retry budget, 503 unconfigured dependency. Error payload `{error: code}`; future request IDs must be random and not identify activities/accounts. Logs never include bodies, auth tokens or full URLs.

Cookie mutations require Origin/Fetch Metadata + CSRF defenses. Same-origin only; no wildcard credential CORS. Shared reads no-store and primary-state validation. A browser-supplied eligible ID list, amount, relationship member list or entitlement flag is ignored/rejected. If-Match applies to the user's own resource revision, never exposes partner revision times. Future idempotency keys are bounded opaque request IDs unique to identity/session + operation, with 24h retention and a body digest; mismatch rejects, repeat returns the same result only after current access validation. A previously authorized result replay cannot bypass revocation.

Metrics allow only the explicit taxonomy in [Monetization](MONETIZATION.md). Use an aggregate endpoint only if needed after legal review; no generic event properties. OpenAPI snapshots and authorization matrix tests must evolve together when new routes open.
