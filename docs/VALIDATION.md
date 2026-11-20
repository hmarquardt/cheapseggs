# Validation evidence

## M3B evidence — content and experiences (2026-11-20)

Validated locally on macOS arm64, Node 26.13.0 before the production release.

| Check                                 | Observed result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog build (`npm run seeds:build`) | 126 immutable activity versions: 109 published non-explicit, 17 unpublished heat-3 drafts. 4 wheels, 12 recipes. Build refuses manifest drift, draft-on-wheel, published heat 3, explicit lint terms, unreachable recipe budgets and undeclared opt-ins.                                                                                                                                                                                                                                                                                                                                                                                      |
| Migration/seed (`npm run test:db`)    | Fresh SQLite applies `0001`–`0005`, seeds twice idempotently, and asserts tier counts (`public_preview` == published), no draft on any wheel, all wheel segments public and heat ≤ 2, recipe steps resolve to public published versions and compatible phases, paired-draw triggers reject a missing/non-public companion, and foreign keys stay clean.                                                                                                                                                                                                                                                                                       |
| Unit/API (`npm test`)                 | **144 passing** in 12 files. Additions: recipe fit/opt-in/environment/time rules; composition invariants for all 12 recipes (unique, ordered, phase-compatible, in budget, heat ceiling); preparation counted once; empty-pool failures with no widening; keeps, re-timing and keep-ineligible; reroll/replacement only from the server candidate list; tampered-plan rejection; cookbook list/detail; `POST /plans` guest requirement; 422 for unknown categories/supplies; wheel directory, Foreplay subset, Double Trouble pair + replay, Dealer's Choice category and unknown-wheel rejection; restricted ids absent from every response. |
| Browser (`npm run test:e2e`)          | **32 passing** across desktop and iPhone 13: existing wheel/account/privacy suites, plus Date Night build → reroll → re-time with focus/status assertions, honest empty state, no cookies/localStorage, cookbook browse/filter/detail/hand-off, mobile overflow and axe checks on the new pages.                                                                                                                                                                                                                                                                                                                                              |
| Full gate (`npm run check`)           | Lint (one pre-existing specificity advisory), strict types, target config, seed drift, auth schema drift, unit tests, SQLite migrations, frontend/Worker builds and compiled workerd auth tests pass.                                                                                                                                                                                                                                                                                                                                                                                                                                         |

These tests prove the new experiences honour the existing eligibility engine and tier gates. They do **not** constitute professional content review, age assurance, partner matching, payments or a claim that heat-3 material is safe to publish.

## M3A evidence (2026-11-20)

`npm run check` passed with 111 unit/integration cases across 10 files, generated Better Auth schema drift, fresh SQLite schema/seed checks, frontend/Worker builds and compiled workerd/D1 email/session/deletion proof. Actual local Wrangler D1 migrations 0003/0004, repeatable seeds and foreign keys passed. `npm run test:e2e` passed 22 desktop/mobile cases including account UX and axe checks. No automated test sends live email. Production release [0f09272 / run 44806692479](https://github.com/hmarquardt/cheapseggs/actions/runs/44806692479) passed validation, deployment and independent smoke. Separate live mobile checks established native email transport acceptance, no automatic session without the code, no overflow and no axe violations; inbox receipt was not independently confirmed. See [LAUNCH_REPORT.md](LAUNCH_REPORT.md).

## M2.1 wheel privacy and abuse hardening (2026-11-20)

Bounded maintenance pass on the released M2 wheel. Validated locally on macOS arm64, Node 26.13.0.

| Check                  | Observed result                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | Biome recommended rules pass (one pre-existing advisory about `innerText` in a browser test)                                                                                                                                                                                                                                                                                                                |
| `npm run typecheck`    | Strict TypeScript passes                                                                                                                                                                                                                                                                                                                                                                                    |
| `npm run config:check` | Adds assertions for the two rate limit bindings: names, integer namespaces, 60 s period, limit ceiling, and four distinct namespace ids across local/production                                                                                                                                                                                                                                             |
| `npm run seeds:check`  | Unchanged: 50 versions, both seed files match committed output                                                                                                                                                                                                                                                                                                                                              |
| `npm test`             | **97 passing** unit/API tests in 8 files: required-key matrix (missing, empty, short, padded, multi-line, non-ASCII, over-long, wrong type), keyed HMAC storage, replay/conflict/key-rotation semantics, rate-limited 429 before guest state, limiter fail-open, result/wedge identity, 30-spin hard-NO and opt-in sweep, client state that tries to widen eligibility, repeat avoidance in a one-idea pool |
| `npm run test:db`      | Unchanged schema constraints still pass                                                                                                                                                                                                                                                                                                                                                                     |
| `npm run test:e2e`     | **18 passing** browser tests (was 16): adds wheel geometry assertions — the wedge under the pointer equals the winner marked in the list, every caption stays inside the rim, and mobile has no horizontal overflow                                                                                                                                                                                         |
| `npm run build`        | Vite + `wrangler deploy --dry-run` compile cleanly and print both rate limit bindings                                                                                                                                                                                                                                                                                                                       |

Defects found and corrected in this pass (all reproducible before the fix):

1. **Wheel captions overflowed the rim and collided.** Preact wrote the camelCase SVG prop
   `textAnchor` verbatim, so the SVG renderer ignored it; every caption was left-anchored at the
   wedge midline and ran outward into the neighbouring wedge (visible in
   `artifacts/production-wheel-mobile.png`). Captions are now radial, anchored at the rim, flipped
   on the left half, and asserted by a geometry test.
2. **The first impression was an empty circle.** With no shortlist yet the disc rendered bulbs, a
   rim and a hub around nothing. It now shows eight dim placeholder wedges and a `SPIN` hub.
3. **The optional sound only chimed at the end.** `playTick` existed but was never called, so the
   "ticking wheel" never ticked. Ticks are now scheduled with a decelerating cadence and cancelled
   when a spin ends, restarts, or the page unloads.
4. **"Not tonight" could wedge a spin.** Exclusions grew past the server's 50-item bound and the
   next spin would 422. The client list is now capped, newest first.
5. **A 429 had no honest message.** `rate_limited` fell through to "The wheel could not answer".

### Production release (M2.1)

Release `44b8b309938d805f976aaaf12921cb7a0143d90f` / Worker
`d844edbe-3029-48e9-80d1-30a22e236faa` passed [GitHub run
44784610515](https://github.com/hmarquardt/cheapseggs/actions/runs/44784610515) (validate → deploy →
independent smoke) and an independent live smoke at 2026-11-20T17:43Z. Live assertions now include
`spinDigestKeyed: true` and `rateLimits {spin, wheel} = {true, true}` — an invalid fingerprint key or
a missing limiter fails the release, and the smoke separately requires a live spin to return 200, so
a keyed-but-broken configuration cannot pass either. A production Chromium session (iPhone 13 viewport) confirmed the
wedge under the pointer is the winner marked in the list (`underPointer 1 = winnerIndex 1`), captions
inside the rim (max radius 90 of 107), no horizontal overflow, **0 cookies and 0 storage entries**,
and exactly one CSP violation: the zone-injected Cloudflare Web Analytics beacon, refused before it
could send anything. Evidence: `artifacts/production-smoke.json`,
`artifacts/production-wheel-m2-1.json`, `artifacts/production-wheel-m2-1.png`.

The release also confirms the secret survived deployment (secrets persist across `wrangler deploy`),
so no GitHub-side value or workflow change was needed.

The rate limit was also exercised against production rather than inferred: 48 spins 120 ms apart from
one address returned 43 successes and then `429 {"error":"rate_limited"}` with `retry-after: 60`. The
threshold is configured at 40, and the platform is documented as approximate and per-location, so a
few requests past the number is expected rather than a defect. The smoke immediately after the
window reset passed, so ordinary play is unaffected. Evidence: `rateLimitProbe` in
`artifacts/production-wheel-m2-1.json`.

### Fail-closed fingerprint correction (2026-11-20, same day)

The M2.1 fallback was removed: the fingerprint key is now mandatory and the spin endpoint fails
closed. Verified locally:

| Check                   | Observed result                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`              | **97 passing** (was 89). Eight key-shape cases — missing, empty, shorter than 32, padded, multi-line, non-ASCII, over-long, wrong type — each return `503 {"error":"unavailable"}`, create **no** guest session and **no** spin row, and report `spinDigestKeyed: false` |
| Keyed-path preservation | Stored value equals `HMAC-SHA-256(key, domain ‖ canonical)` and changes with the key; replay returns one result; a changed body is `409 spin_conflict`; rotating the key turns a replay into `409 spin_conflict` rather than a guess or a new result                     |
| `requestDigest` unit    | Rejects instead of hashing: `requestDigest(undefined, …)` and a short key both throw `spin_digest_key_unavailable`; the unkeyed code path no longer exists                                                                                                               |
| Error surface           | The response body is exactly `{"error":"unavailable"}` — no key material, no request fields, no indication of which check failed; nothing is logged                                                                                                                      |
| `npm run config:check`  | Local `wrangler.jsonc` declares the documented development key and production asserts **no** plaintext `SPIN_DIGEST_KEY` var (secret only)                                                                                                                               |
| `npm run test:e2e`      | 18 passing; `npm run dev` now runs the required-key path, so browser coverage exercises the same branch as production                                                                                                                                                    |

### Production release (fail-closed key)

Release `fbb0ad581b8613be6e02e9610069cf1210212751` / Worker
`640dc13d-32f3-4956-8ed4-d2b3c3472c29` passed [GitHub run
44801216297](https://github.com/hmarquardt/cheapseggs/actions/runs/44801216297) (validate → deploy →
independent smoke). The smoke now rejects an invalid key **and** requires a live spin, so it proves
both halves of the contract on every release.

Independent verification: `/api/version` reports `spinDigestKeyed: true` and
`rateLimits {spin: true, wheel: true}` for the pushed commit; a live production spin returned
`200` (`Compliments, on the house`) with the wedge under the pointer equal to the winner in the list,
no fail-closed message, **0 cookies** and **0 storage entries**. Evidence:
`artifacts/production-smoke.json`, `artifacts/production-fail-closed.json`.

### Verification limits (M2.1)

Still not done: moderated adult usability testing, professional content review of the 44 published
entries, real assistive-technology passes (VoiceOver/NVDA), and load testing. Rate limiting is
approximate and per Cloudflare location, so it slows bulk automation rather than stopping it. The
zone's Cloudflare Web Analytics beacon is injected at the edge and refused by CSP (verified in a
production Chromium run: one CSP violation, no payload sent); disabling it in the dashboard remains
a recommendation, not a configuration change (the deployment token has zone read only).

## M2 guest Discovery wheel (2026-11-20)

Implemented and validated locally on macOS arm64, Node 26.13.0 / npm 11.20.0.

| Check                          | Observed result                                                                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                 | Biome recommended rules pass; no errors or warnings                                                                                                                                                  |
| `npm run typecheck`            | Strict TypeScript passes with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`                                                                                                            |
| `npm run config:check`         | Local/production separation, bindings, routes, CSP hash and six social images unchanged                                                                                                              |
| `npm run seeds:check`          | 50 immutable versions compile from the editorial source; both seed files match committed output                                                                                                      |
| `npm test`                     | **77 passing** unit/API tests in 8 files, including 21 through Hono + real SQLite (`node:sqlite`) over the migrated/seeded schema                                                                    |
| `npm run test:db`              | Fresh SQLite: 50 versions, 44 published, 3 previews, 0 published heat-3 rows, wheel integrity, guest-session cascade, epoch/revocation/webhook uniqueness                                            |
| `npm run db:migrate`/`db:seed` | Actual Wrangler local D1 applies `0002` and seeds 50 activities; idempotent on repeat                                                                                                                |
| `npm run test:e2e`             | **16 passing** browser tests (8 scenarios × desktop Chrome + iPhone 13) including axe on four screens, focus order, reduced motion, keyboard-only spin, empty-menu message, and zero cookies/storage |
| `npm run build`                | Vite build + `wrangler deploy --dry-run` compile cleanly                                                                                                                                             |

New automated coverage added for M2:

- **Selection/property**: uniform distribution over seven activities (14,000 draws,
  chi-square < 22.46), exact weighted distribution (16,000 draws, ±0.03), winner always
  present in the shortlist, shortlist uniqueness and sizing, empty pool, caption clipping.
- **Eligibility boundaries**: heat/experimentation/energy/time/environment/supplies,
  required category opt-ins derived from the database flag, hard exclusions, draft
  exclusion, pack access.
- **Idempotency and revocation**: identical replay returns one result, changed digest is
  rejected, concurrent duplicates converge, a foreign session is rejected, a withdrawn
  activity invalidates the replay.
- **Guest lifecycle**: nonce reuse, 24h expiry with purge, explicit reset (204, idempotent),
  200-spin budget, and a schema assertion that no boundary value is stored.
- **Request boundary**: 415/422/413/400/403 cases, unknown ids, cross-site posts, and the
  pre-existing auth/payment 503 boundaries.

### Build footprint (M2)

| Asset                   |     Raw |    gzip |
| ----------------------- | ------: | ------: |
| Lounge/wheel JavaScript | 32.4 KB | 12.2 KB |
| Shared CSS (all pages)  | 16.9 KB |  4.6 KB |
| Public home HTML        |  5.5 KB |  2.2 KB |

No new runtime dependency was added; the wheel, sound and animation are first-party code.

### Production release (M2)

Release `dbfdeeb8bc7a3d3895ac5584a9fd91a81fa73dd0` / Worker
`37595d94-f426-4da0-8292-1fbf23f20148` passed [GitHub run
44778212175](https://github.com/hmarquardt/cheapseggs/actions/runs/44778212175) (validate +
deploy + smoke) and an independent live smoke at 2026-11-20T16:58:15Z. Live assertions
included the content gate (`byHeat["3"] === 0`), a real spin with an 8-wedge shortlist and
`discovery-prompt-not-consent`, replay of the same key, `409 spin_conflict` for a changed
body, `204` reset, and a mobile browser run with zero cookies and zero browser storage.
Evidence: `artifacts/production-smoke.json`, `artifacts/production-wheel-mobile.png` and
[Launch report](LAUNCH_REPORT.md).

### Verification limits (M2)

Not done: professional content review of the 44 published entries, moderated adult
usability testing (the 90% comprehension and <60 s first-result targets), screen-reader
testing on real devices/assistive tech, load testing, and any authentication, partner,
assessment or payment workflow. Cloudflare rate limiting landed in M2.1. The catalog is
non-graphic by construction and by lint, not by professional editorial sign-off.

## Public-release update (2026-11-20)

The original evidence below is historical. Foundation commit `984952e34e073690f29350efdaf373059addbdd3` is pushed to main and passed [GitHub validation](https://github.com/hmarquardt/cheapseggs/actions/runs/44755167323) on Node 24/Linux. The production release adds config/PNG checks, 42 unit/API/release tests and 8 desktop/mobile browser tests, including all nine public pages across four crawler user agents and consent/privacy/duplicate-pageview boundaries. Final release results and live deployment evidence are in [Launch report](LAUNCH_REPORT.md).

No private workflow, predictive compatibility algorithm, authentication implementation or payment integration is certified by the public release.

Production delivery also passed end-to-end in [run 44761879392](https://github.com/hmarquardt/cheapseggs/actions/runs/44761879392), commit `4e69dd1b767953b0830d39f13fed0bc28e5072c9`: Node 24/Linux validation, actual local D1 migrate/seed checks, eight browser tests, remote reviewed migrations/seed, Cloudflare deployment and full production smoke. An independent live run matched the CI artifact's SHA and Worker version. The smoke includes HTTPS/apex/www/plain-HTTP redirects, assets, nine pages × four user agents, PNG dimensions, APIs/database, headers and disabled private/auth/payment boundaries. Four additional unit cases cover deployment propagation without accepting stale versions or suppressing application failures.

Live integrations: one real opt-in CFLab pageview confirmed by collector 204 plus exact reporting-storage readback; dashboard UI login remains unavailable. Google domain ownership and sitemap processing verified by API and the owner's browser, with sitemap Success / nine discovered URLs. No live Facebook/X/LinkedIn card inspector, future auth/object authorization, actual game, questionnaire or payment behavior is claimed.

## Original foundation evidence

Executed locally 2026-11-19 (America/Chicago) on macOS arm64, Node 26.13.0 / npm 11.20.0. Repository recommends Node 24 LTS, minimum 24.15; CI definition uses `.nvmrc`. CI has **not** run on GitHub because no changes were pushed. Node 24/Linux remains a CI verification boundary, not a claimed local result.

## Passing checks

| Command / review               | Observed result                                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm install / lockfile refresh | Exact dependency versions locked; install audit reported zero known vulnerabilities at that time                                                                              |
| npm run lint                   | Biome recommended rules + formatting pass, no warnings/errors in final check                                                                                                  |
| npm run typecheck              | Strict TypeScript check passes                                                                                                                                                |
| npm test                       | 4 files, **32 passing tests**: eligibility/version/exclusions, weighted rejection sampling, entitlements/refunds/expiry/sharing and fail-closed API boundaries                |
| npm run test:db                | Fresh in-memory SQLite applies migration, seeds twice, validates catalog, FKs, two-member capacity, epoch changes, deletion cascade, event uniqueness                         |
| npm run db:migrate             | Actual Wrangler **local D1** migration applied successfully (47 SQL commands); no remote database created                                                                     |
| npm run db:seed twice          | Idempotent; exactly three sample activity versions                                                                                                                            |
| npm run db:check               | No foreign-key violations, three sample activities                                                                                                                            |
| npm run build                  | Vite static/client build and Wrangler Worker **dry run** successful; no deploy                                                                                                |
| npm run test:e2e               | **4 passing** tests across desktop Chromium and iPhone-sized Chromium emulation, using local Worker + D1                                                                      |
| Browser accessibility          | Axe scans on landing, entered lounge and privacy page returned zero violations for tested states                                                                              |
| Interaction/privacy smoke      | Preview adult acknowledgement, mode selection, keyboard skip link/focus transfer, clear control, empty browser web storage, reload resets acknowledgement, no page exceptions |
| HTTP/runtime smoke             | D1 readiness, public sample catalog, missing private routes 404, billing 503, static CSP and private-shell no-store                                                           |
| Visual review                  | Desktop/mobile landing and mobile lounge screenshots inspected; readable layout, no landing horizontal overflow at tested sizes                                               |
| Repository review              | Named empty public GitHub repo verified read-only via connector; local origin configured; no commit/push/PR/deployment performed                                              |

Final `npm run check` completes lint, typecheck, all unit tests, fresh SQLite checks and both builds. Final browser run passes after that build. Tests initially found an invalid readiness column and content outside a landmark; both were corrected and reverified. Playwright’s matching Chromium browser was installed locally to run QA; no external service was provisioned.

## Build footprint

Measured Vite output, latest checked build (compression estimates from build tool):

| Asset                         |      Raw |    gzip |
| ----------------------------- | -------: | ------: |
| Interactive lounge JavaScript | 18.08 KB | 7.66 KB |
| Shared CSS                    |  9.23 KB | 3.01 KB |
| Public home HTML              |  5.37 KB | 2.14 KB |
| Lounge HTML                   |  0.85 KB | 0.49 KB |
| Privacy HTML                  |  2.81 KB | 1.44 KB |

Worker bundle: approximately 69.01 KiB raw / 17.89 KiB gzip. Static public landing requires no JavaScript. No runtime font/image/analytics CDN calls. Browser screenshots and traces live in ignored `test-results/`; CI uploads them only on failure with a three-day retention. Do not use production intimate data in these artifacts later.

## Verification limits

No live auth, email, age assurance, payments, intimate-data encryption, matching endpoints or purge/restore operations exist, so their production behavior is not certified by these tests. A 404 for an unimplemented private route is not proof of future object authorization. No penetration test, full screen-reader audit, real iOS/Safari run, load test, D1 replication/concurrency benchmark, Mermaid rendering check, or legal/processor approval was performed. These are scoped milestone gates, not hidden work completed by the scaffold.

Initial sandbox restrictions blocked Wrangler’s diagnostic-log/local-runtime access; after local execution permission was available, the actual migration/build/browser checks ran successfully. No production permissions were used. The checked-in workflow contains only validation/local D1 and no scheduled job, deployment or production credentials.

## Chemistry Check planning update (2026-11-20)

Documentation/instructions only: added the module specification and ADR 0005, then reconciled product, architecture, auth, privacy/security, API/data-model planning, monetization/payment/cost analysis, SEO/brand, roadmap and decision report. Researched current official OkCupid, RELATE, Prepare/Enrich and Truity offer descriptions; sources and price caveats are in [Monetization](MONETIZATION.md#chemistry-check-standalone-acquisition-and-assessment-product).

Re-ran `npm run check`: lint, strict types, all **32 existing tests**, fresh SQLite migration/idempotent seed/constraint checks, Vite build and Worker **dry run** pass. These tests verify the unchanged executable foundation, **not** a Chemistry Check implementation. No new assessment tests were added for a feature that does not exist. Documentation file/heading links and duplicate headings are checked separately. Browser tests were not rerun for this documentation-only update; the earlier four-test browser evidence above remains dated to the foundation. Executable migrations, seed, handlers, frontend and OpenAPI have no Chemistry Check additions; nothing deployed or provisioned.

## Chemistry Check Increments 1–2 (2026-11-20)

Implemented against `ad699fd` (the M3B-audited `main`): the versioned 100-question non-explicit bank,
nested 25/50/100 manifests, typed response/acceptance contract with structural validation, weighted
acceptance scoring with conservative `min()` reciprocity, coverage thresholds, tri-state hard-requirement
evaluation with private-only suppression, the coarse report serializer, and the account-free
`/chemistry/` demonstration with review/edit and deterministic synthetic data.

| Check                      | Result                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`            | exit 0 — Biome, strict TypeScript, config gates (100 unique questions, exact nested allocations, bounded choices, intimacy flags), 190 unit tests, fresh SQLite migration/idempotent seed/constraint checks, Vite + Worker dry run, auth worker                                                                                                                     |
| `npx vitest run`           | **15 files / 190 tests passed**, including 27 new chemistry domain and demonstration tests                                                                                                                                                                                                                                                                          |
| `npx playwright test`      | **38 passed** (19 tests × desktop + mobile), including 4 new chemistry browser checks                                                                                                                                                                                                                                                                               |
| Chemistry browser coverage | explicit answer + acceptance rule, skip, finish-early, honest insufficient-coverage state, demonstration fill, eight category bands, intimacy unassessed by default, disclosure copy, no percentage or importance/dealbreaker terms in the shared report, focus on the question heading, reduced motion, axe (0 violations), no horizontal overflow, no page errors |
| Privacy non-interference   | unit tests prove private-only answer content, weights and hard rules cannot change a shared report byte-for-byte, cannot raise coverage and cannot surface as `conflict_detected`                                                                                                                                                                                   |

Not implemented and therefore not validated: D1 assessment tables, invitation tokens, account binding,
encrypted envelopes, release approvals, withdrawal/purge, cross-account authorization, encryption key
lifecycle and restore drills. **No real assessment answer, invitation or report is collected, stored or
served.** Demonstration answers live only in component state: no network request carries them, and there
is no browser storage or analytics event. Two-person enablement remains gated on the independent review
described in [Chemistry Check](CHEMISTRY_CHECK.md) and is not claimed here.

Approximate build addition: `dist/client/assets/chemistry-*.js` 57.45 KB raw / 18.29 KB gzip, including
the 100-question editorial bank. The page adds no server route or D1 migration.
