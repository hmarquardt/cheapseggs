# Foundation validation evidence

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
