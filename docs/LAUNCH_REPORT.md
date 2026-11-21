# C1.1 independent audit checkpoint (2026-11-20)

The [independent Chemistry Check security audit](CHEMISTRY_CHECK_SECURITY_AUDIT.md) supersedes the
implementation handoff's security claims. It reproduces and corrects final-release scope binding,
revocation/write races, hard-signal disclosure, concurrent-claim/release teardown, retention, invitation
capacity and private UI revocation defects. **Private beta is not approved.** Both activation flags and
the production envelope key remain absent. No real private collection, production key or restore is
part of this assignment.

Baseline `39374a900b7d21e9f3a9356edae528ed5430aeef` was verified on production as Worker
`9a3eeb54-6785-44e0-9a24-71338c6db465`, with `chemistryPrivate: false`; read-only aggregate D1 inspection
found zero assessments, encrypted participants and reports. Baseline checks passed 222 tests. Seven
new adversarial tests all failed against that baseline on actual local D1, then passed after corrections.
Remediation validation passes 253 unit/HTTP/local-D1 tests, 40 desktop/mobile browser tests, fresh
migrations/FKs, both compiled Worker scenarios and a 364-case partial-configuration gate matrix.

The release containing this checkpoint must pass the normal Actions validate → deploy → live smoke
pipeline. Its `production-verification` artifact records the exact commit/Worker/version timestamp,
including 91 production-disabled route/method probes. Current identity always comes from `/api/version`
and Cloudflare's version tag, not historical identifiers in this file. The audit's completion delivery
records independently observed release evidence after that pipeline; this checkpoint alone is not a
claim that a future deployment succeeded. Hourly native Worker cleanup is added without a new service;
external deletion-ledger continuity, restore reconciliation and purge monitoring remain beta gates.

# Public launch evidence

## Chemistry Check private backend release — 2026-11-20 (production-disabled)

| Evidence          | Observed                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release           | `cac0d6e872782eae8be9a2739c6087ea71f3658a`; worker `cb19a23b-90e1-45f9-b1c1-1fa2bc193455`                                                             |
| Pipeline          | [44844348497](https://github.com/hmarquardt/cheapseggs/actions/runs/44844348497): validate, deploy and 23 production smoke checks succeeded           |
| Migrations        | `0007_chemistry_check.sql` and `0008_chemistry_invitation_label.sql` applied by the guarded release; tables remain empty until activation             |
| Gate              | `/api/version` reports `chemistryPrivate: false`; `GET /api/v1/chemistry-check/status` and an unauthenticated create both return 404                  |
| Public demo       | `/chemistry/` 200; live mobile sample report renders eight bands, zero page errors, zero overflow, and the real panel is absent                       |
| Existing features | Smoke artifact still passes wheels, paired draws, restricted-content 404s, Date Night, cookbook, metadata, account boundaries and rate-limit identity |
| Tests             | 222 unit/integration tests (14 foundation, 18 HTTP with three accounts); 38 browser cases including the unchanged demonstration                       |
| Not enabled       | Real private collection, envelope key, review flag, scheduled purge job, independent audit                                                            |

Implemented behind the closed gate: migration-backed two-account assessments, hashed label-confirmed
invitations, AES-256-GCM drafts and submissions, per-epoch mutual release approvals, encrypted coarse reports,
withdrawal/deletion/expiry/purge, pair cooldown and keyed abuse budgets. See
[Chemistry Check security handoff](CHEMISTRY_CHECK_SECURITY_HANDOFF.md) for the review package and activation
checklist. No real assessment answer, invitation or report exists in production.

## Chemistry Check demonstration release — 2026-11-20

| Evidence            | Observed                                                                                                                                                                                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implemented release | Feature commit `e854433` plus acceptance-mode follow-up `f24b835`; `/api/version` read back `f24b835` with worker `cf09e991-21b9-463c-8ee8-d44734fdd870`                                                                                                                                                                    |
| GitHub pipeline     | [44839491823](https://github.com/hmarquardt/cheapseggs/actions/runs/44839491823) (feature) and [44840140651](https://github.com/hmarquardt/cheapseggs/actions/runs/44840140651) (follow-up): validate, deploy and production smoke all succeeded                                                                            |
| Worker              | `cf09e991-21b9-463c-8ee8-d44734fdd870`; `X-CheapSeggs-Revision` and `/api/version` matched `f24b835` at verification time                                                                                                                                                                                                   |
| Shipped             | Versioned 100-question non-explicit bank, nested 25/50/100 manifests, acceptance-based scorer, tri-state hard-requirement evaluation and `/chemistry/` demonstration                                                                                                                                                        |
| Page                | `/chemistry/` 200 with canonical metadata, `index, follow`, its own hashed bundle and a no-JavaScript fallback; in sitemap                                                                                                                                                                                                  |
| Live browser        | Mobile 390×844 against production: sample report renders eight coarse bands, intimacy unassessed with the mutual opt-in explanation, no percentage; an empty draft gets the honest insufficient-coverage state; the acceptance-mode warning appears then clears; 0 horizontal overflow, no page errors, axe checked locally |
| Data boundary       | No `/api/` request, query parameter or request body carried demonstration answers; the page imports no analytics and emits no CFLab event                                                                                                                                                                                   |
| Zone beacon         | Cloudflare attempts to inject `static.cloudflareinsights.com/beacon.min.js` on all pages; the existing CSP blocks it (`script-src 'self'`), observed on `/`, `/play/` and `/chemistry/`. No beacon executes. Pre-existing, unchanged                                                                                        |
| Existing features   | Smoke artifact confirms wheels, Double Trouble/Dealer's Choice, restricted-content 404s, Date Night plan, cookbook, metadata and account boundaries still pass                                                                                                                                                              |
| Automated checks    | 190 unit/integration assertions in 15 files (27 Chemistry Check); 38 desktop/mobile browser cases including 4 new chemistry checks                                                                                                                                                                                          |
| Evidence files      | CI artifact `production-verification/production-smoke.json` (downloaded and inspected); no answers, invitations or private identifiers exist to leak                                                                                                                                                                        |

Implemented: the Increment 1 question catalog and deterministic scorer, and the Increment 2 playable
demonstration. Nothing is persisted: there is no assessment table, invitation token, encrypted envelope,
release approval, withdrawal route or account binding. Real two-person collection therefore remains
**disabled by absence**, not by a flag that could be flipped accidentally.

Not implemented or authorised: independent invitations, mutual release approvals, encrypted response
storage, key lifecycle, purge/restore drills, cross-account authorization, paid depths and any
compatibility claim beyond coarse editorial bands. Those are Increments 3–5 and require the independent
security review described in [Chemistry Check](CHEMISTRY_CHECK.md) before any real submission is accepted.

## M3B experience release — 2026-11-20

| Evidence            | Observed                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implemented release | `a3ab0d22c8b822b3e13fa5ad13298a340e672f86` (product commit `f56f9c4`; two browser-test robustness follow-ups)                                                                                                 |
| GitHub pipeline     | [44832066386](https://github.com/hmarquardt/cheapseggs/actions/runs/44832066386): validate, deploy and independent production smoke all succeeded                                                             |
| Worker              | `6b46922f-40a0-4096-8909-8a228e145095`; `/api/version` revision matches the pushed commit                                                                                                                     |
| Migration           | `0005_experiences.sql` applied remotely (wheel presentation/draw columns, category blurbs, paired spin companions, recipe template/step extensions)                                                           |
| Public catalog      | `/api/v1/wheels/misfortune` reports 109 reviewed ideas; heat 3 unavailable; four opt-in categories (touch, senses, make-believe, playful power)                                                               |
| Wheel directory     | `/api/v1/wheels` lists Misfortune (109 segments), Foreplay, Double Trouble (pair) and Dealer's Choice (category); Foreplay reports zero spicy segments                                                        |
| Pair/category draws | Live Double Trouble returned two distinct compatible ideas inside 240 minutes; Dealer's Choice returned the category it displayed. Restricted ids absent                                                      |
| Cookbook            | `/api/v1/recipes` returns 12 published recipes with `cookbook+…` revision; `/api/v1/recipes/slow-cooker` 200; `/api/v1/recipes/draft-silk-and-ice` and `/api/v1/content/draft-silk-and-ice/1` 404             |
| Date Night          | Live plan (`playful/medium/curious/hour/home`) returned `Leftovers Can Be Delicious`, 45 planned of 60 minutes, slots preparation → warm-up → main → finale, marker `date-night-plan-not-consent`             |
| Pages               | `/date-night/` and `/recipes/` 200 with their own hashed bundles, indexable metadata and a no-JavaScript fallback; `/play/` 200 noindex; sitemap has 9 public URLs and omits `/play/` and `/api/`             |
| Boundaries          | No `draft-`/restricted title in served HTML or bundles; new CSP hash for the updated JSON-LD; HSTS, no-referrer, DENY framing and restricted Permissions-Policy present on the new pages                      |
| Automated checks    | 144 unit/integration assertions in 12 files; 32 desktop/mobile browser cases including axe, reduced motion, keyboard-only spin, Date Night compose/reroll/re-time, cookbook browse/detail and mobile overflow |
| Evidence files      | CI artifact `production-verification/production-smoke.json`; local `artifacts/production-smoke.json` from the independent re-check                                                                            |

Implemented: 65 new non-explicit catalog ideas in two new categories (flirting/teasing and playful power), 11 restricted adult drafts kept unpublished, four public wheels on one eligibility engine, the complete Date Night Machine with server-validated reroll/replace/re-time/restart, twelve original cookbook recipes, and public pages/navigation that describe what actually works.

Not implemented or not authorised: independent age verification, heat-3 publication, partner matching, Chemistry Check, payments, entitlements, saved or shared plans, professional content review and moderated adult usability testing. Habanero remains visibly locked. The following documentation-only commit changes the Worker revision again; read `/api/version` for the current identity rather than inferring it from this table.

## M3A first production release — 2026-11-20

| Evidence             | Observed                                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Implemented release  | `0f09272e528ec1e664221b22bf86a5a68ae130d2`                                                                                                                                                                                                             |
| GitHub pipeline      | [44806692479](https://github.com/hmarquardt/cheapseggs/actions/runs/44806692479): validate and deploy, including independent production smoke, passed                                                                                                  |
| Worker               | `5e51e3d5-c724-458c-8a6a-fb81d2c99dfe`; `/api/version` revision and Cloudflare `workers/tag` both match that release                                                                                                                                   |
| Account availability | `/account/` 200/no-store/noindex; `/api/account/status` email sign-in true, age verification false, restricted content false; unauthenticated account GET 401                                                                                          |
| Real email setup     | Cloudflare Email Sending enabled for cheapseggs.com; SPF, DKIM and DMARC resolve publicly; fixed accounts@cheapseggs.com native sender; independent auth secret provisioned securely                                                                   |
| Real transport check | 2026-11-20 19:59 UTC: the production form accepted one code request to the founder's Cloudflare owner inbox. Native transport acceptance confirmed; inbox receipt not independently observed. No code or recipient was written into evidence artifacts |
| Live browser         | Mobile 390×844: 0 axe violations, no horizontal overflow, code sending requires an explicit adult declaration, code request creates no session/cookie; unauthenticated account remains 401                                                             |
| Automated checks     | 111 unit/integration assertions across 10 files; generated auth-schema drift; compiled workerd/D1 lifecycle; local D1 migrations/seed/FK checks; 22 desktop/mobile browser cases                                                                       |
| Evidence files       | CI artifact `production-verification/production-smoke.json`; local ignored `artifacts/m3a-account-live.json` and downloaded `artifacts/m3a-first-release/production-smoke.json` contain no codes, cookies or recipient                                 |

Implemented: maintained Better Auth 1.7.27 registration/sign-in, email recovery, seven-day absolute/24h idle sessions, fresh-auth deletion, device/all-device revocation, separate adult declarations, optional non-explicit category approvals and explicit guest discard before account navigation. The public guest wheel remains account-free with its existing boundaries. A follow-up release records this evidence and clarifies that separately signed-in visitors may already have an account cookie; that cookie does not affect guest selection.

Supported access states: guest; registered with absent/expired/withdrawn adulthood declaration; registered self-declared adult; independently selected preview category approvals. Independently age-verified and premium-entitled states are modeled as separate checks but cannot be obtained through M3A. All real assurance callbacks, restricted adult content, private matching, Chemistry Check and payments remain closed.

Exact restricted-content blockers: no approved launch-entity/jurisdiction matrix or content classification; no approved assurance provider/budget/DPA/retention agreement; no implemented verified callback/epoch/replay/revocation lifecycle; specialist sensual/kink content review and the applicable sensitive-data/privacy/deletion-restore gates remain outstanding. [AGE_ASSURANCE.md](AGE_ASSURANCE.md) records primary-source research, vendor options, price evidence and the activation checklist. No age-assurance service or new subscription was activated.

The table records the first M3A release, not an assertion that later documentation or copy revisions have the same SHA. Read the current `/api/version` and the latest successful pipeline artifact for current production identity.

## M2.1 privacy and abuse hardening release (2026-11-20)

| Item                     | Observed                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Release                  | commit `44b8b309938d805f976aaaf12921cb7a0143d90f`, Worker `d844edbe-3029-48e9-80d1-30a22e236faa`                                                                                                                   |
| CI                       | [run 44784610515](https://github.com/hmarquardt/cheapseggs/actions/runs/44784610515) — validate, deploy and independent smoke all passed                                                                           |
| `/api/version`           | revision matches the pushed commit; `spinDigestKeyed: true`; `rateLimits {spin: true, wheel: true}`                                                                                                                |
| Worker secret            | `SPIN_DIGEST_KEY` set once with `wrangler secret put` and still bound after deploy; it is mandatory — spins fail closed with 503 without a valid key, and the release check rejects that state before users see it |
| Live spin                | `Set the soundtrack` on a real spin; the wedge under the pointer equals the winner marked in the ordered list; captions inside the rim; no horizontal overflow                                                     |
| Guest privacy in browser | 0 cookies, 0 `localStorage`/`sessionStorage` entries after acknowledgement, spin and result                                                                                                                        |
| CSP                      | one violation: `static.cloudflareinsights.com/beacon.min.js` refused by `script-src 'self'`; no beacon payload sent                                                                                                |
| Abuse control (live)     | 48 spins from one address: 43 accepted, then `429 {"error":"rate_limited"}` with `retry-after: 60`; the next smoke after the window reset passed                                                                   |
| Evidence                 | `artifacts/production-smoke.json`, `artifacts/production-wheel-m2-1.json`, `artifacts/production-wheel-m2-1.png`                                                                                                   |

Fixed in this pass: the persisted fingerprint is HMAC-keyed (a database reader can no longer recover
heat, opt-ins or hard-NOs by enumeration), the public endpoints carry Cloudflare-native per-location
rate limits that store nothing in D1, wheel captions no longer overflow their wedges, the disc is no
longer an empty circle before the first spin, optional sound ticks again, and "not tonight" can no
longer push exclusions past the server bound.

## Fail-closed fingerprint correction (2026-11-20, same day)

The M2.1 fallback was removed after review: the fingerprint key is mandatory.

| Item                | Observed                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Release             | commit `fbb0ad581b8613be6e02e9610069cf1210212751`, Worker `640dc13d-32f3-4956-8ed4-d2b3c3472c29`                                         |
| CI                  | [run 44801216297](https://github.com/hmarquardt/cheapseggs/actions/runs/44801216297) — validate, deploy and smoke passed                 |
| `/api/version`      | `spinDigestKeyed: true`, `rateLimits {spin: true, wheel: true}`, production environment for the pushed commit                            |
| Live spin           | 200 `Compliments, on the house`; wedge under the pointer = winner in the list; no fail-closed message                                    |
| Browser privacy     | 0 cookies, 0 storage entries; only CSP refusal is the zone-injected Cloudflare beacon (unchanged)                                        |
| Fail-closed (local) | eight key shapes return `503 {"error":"unavailable"}` with zero guest sessions and zero spins; `requestDigest` throws instead of hashing |
| Rate limits         | unchanged: both bindings still bound and enforcing; `/api/v1/wheels/misfortune` still answers so the page explains itself                |
| Evidence            | `artifacts/production-smoke.json`, `artifacts/production-fail-closed.json`                                                               |

Decision record: [ADR 0009](DECISIONS/0009-mandatory-fingerprint-key.md) supersedes the fallback in
[ADR 0008](DECISIONS/0008-m2-1-fingerprint-and-rate-limits.md) decision 2; every other M2.1 decision
stands.

## M2 release — first playable Wheel of Misfortune (2026-11-20)

Commit **`dbfdeeb8bc7a3d3895ac5584a9fd91a81fa73dd0`** was pushed to `main` and released by
[GitHub run 44778212175](https://github.com/hmarquardt/cheapseggs/actions/runs/44778212175):
`validate` **success** (lint, strict types, config/seed drift, 77 unit/API tests over real
SQLite, local D1 migrate + double seed + FK check, 16 desktop/mobile browser tests, builds) and
`deploy` **success** (guarded release, remote migrations `0001`+`0002`, generated catalog seed,
tagged Worker upload, production smoke).

| Evidence                  | Observed result                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production identity       | `/api/version` → revision `dbfdeeb…3dd0`, Worker `37595d94-f426-4da0-8292-1fbf23f20148`, `production`                                                                                                                                                                                             |
| CI production smoke       | passed in the deploy job; `production-verification` artifact uploaded for that SHA                                                                                                                                                                                                                |
| Independent smoke         | `EXPECTED_REVISION=dbfdeeb… npm run smoke:production` passed at 2026-11-20T16:58:15Z with the same SHA and Worker version                                                                                                                                                                         |
| Wheel configuration       | `GET /api/v1/wheels/misfortune` → 44 published entries, `byHeat {0:17,1:21,2:6,3:0}`, 3 opt-in categories, revision `misfortune@1+7ed96c53b1dc5e61`                                                                                                                                               |
| Live spin                 | `POST /api/v1/spins` (spicy + touch opt-in) → 200, 8-wedge shortlist, `mode: discovery-prompt-not-consent`, 24h guest expiry, `eligibleCount 12`                                                                                                                                                  |
| Idempotency in production | same key/body replays one result; changed body → `409 spin_conflict`; `DELETE /api/v1/guest` → 204 (all asserted by the smoke)                                                                                                                                                                    |
| Real device run           | iPhone 13 viewport against `https://cheapseggs.com/play/`: acknowledgement → spin → result card (`Kitchen sway`, Movement/Mild/10 min), 8-item list with the winner marked, no horizontal overflow, **0 cookies, 0 local/session storage**, screenshot in `artifacts/production-wheel-mobile.png` |

### Deliberate boundary observation (re-verified 2026-11-20, M2.1)

This zone has Cloudflare Web Analytics (RUM) enabled, so the edge injects a beacon script into HTML
responses — including Worker-served pages such as `/play/`:

```html
<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/vce7018…"
        data-cf-beacon='{"version":"2024.11.0","token":"51758fcb…","r":1,"spa":2}' crossorigin="anonymous">
```

**The verification method matters.** A plain `curl` without `Accept: text/html` (and with a
cache-busting query string) receives cached bytes that do not contain the tag; an intermediate M2.1
draft wrongly concluded from that alone that no beacon was served, and this note is corrected here.
Repeating the request the way a browser does makes it visible:

```sh
curl -sS -H 'accept: text/html' https://cheapseggs.com/play/ | grep -o 'beacon.min.js[^"]*'
```

Our CSP is `script-src 'self'`, so the browser refuses the script before it executes. A real
Chromium session against production (iPhone 13 viewport, 2026-11-20) recorded exactly one CSP
violation — the refused `beacon.min.js` module — and no beacon payload was sent. The privacy impact
today is therefore none, and the position is unchanged in principle: we do not widen CSP to admit a
tracker we did not choose, and CheapSeggs ships only its own consented, path-allowlisted CFLab
adapter.

**Recommendation (not performed):** disable Web Analytics for `cheapseggs.com` in the Cloudflare
dashboard (`Analytics → Web Analytics`) so the tag stops being injected. It is a zone-level setting
that neither `wrangler.jsonc` nor the build controls, and the deployment credential in CI has zone
read only, so changing it would require a broader token than this release uses. No billing change is
involved.

### What this release does and does not claim

Delivered: a working guest Discovery wheel with a gated non-explicit catalog, server-authoritative
selection, readable/accessible presentation and transient guest state. Not delivered and not
claimed: professional content review, moderated adult usability testing, heat-3 or explicit
content, accounts, partner matching, assessments, recipes, purchases, or any analytics of spins.

## Public foundation release (2026-11-20)

The safe public application is live from GitHub. Independent full production verification passed on 2026-11-20 at 15:11 UTC for the release recorded below. The safe application is public explanations and a non-explicit design preview, not working games or private account features.

## Implemented scope

Nine indexable explanation/policy pages, six original 1200×630 social cards with SVG sources, initial-HTML metadata, canonical redirects, sitemap/robots, safe sample catalog, D1 readiness, release identity and security headers. Auth/payment endpoints fail closed. Chemistry Check remains planned; its public page is an explanation only. No private responses, test accounts, new paid subscription, R2 bucket or payment provider is enabled.

## External integration state

CFLab site `as_v3ng10kbDYMLWnFWOsf52W` is legitimately registered with apex/www domains and seven-day raw retention. The consent adapter is implemented; a real production opt-in browser pageview returned 204 and was read back in reporting storage with no session/referrer/campaign/props fields. No authenticated reporting UI session is available, and none will be fabricated.

Search Console domain property `sc-domain:cheapseggs.com` is DNS-verified. The existing service account and intended human owner have ownership; API readback is `siteOwner`. Site Verification API was enabled in existing project 184307746744. Google accepted the sitemap submission (204); the owner’s live sitemap UI subsequently reported Success and 9 discovered pages. The overview is still processing; no indexing/ranking outcome is claimed.

GitHub validation/release workflow and production main-only environment are configured. Durable repository secret `CLOUDFLARE_API_TOKEN` is configured with account/zone scopes documented in the runbook, expiring November 2027. Main requires validation; the production environment allows main only. No manual bootstrap deploy was used.

## Release evidence

| Evidence                             | Observed result                                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Branch/source                        | main, hmarquardt/cheapseggs; all completed changes pushed                                                                        |
| First independently verified release | `83ac36c255bff687cd338b80fa556d767b26a39f`                                                                                       |
| Worker version for that release      | `6bf0daac-42a3-4898-80fa-de62ffdbc04d`                                                                                           |
| Independent smoke time               | 2026-11-20 15:11:43 UTC; all checks passed                                                                                       |
| Public delivery                      | Apex HTTPS, www 308, nine canonical pages, assets, robots and sitemap                                                            |
| Metadata                             | Browser/Facebook/X/LinkedIn identical initial HTML; six 1200×630 PNG cards available                                             |
| API/data                             | Health and D1 ready 200; exactly three reviewed public samples; no users; no FK violations                                       |
| Sensitive boundaries                 | Private placeholders 404 + noindex/no-store; auth and payments 503; no auth cookies                                              |
| Security                             | CSP, HSTS, no-referrer, frame restriction and per-response revision verified                                                     |
| UI                                   | Live mobile landing/Chemistry pages have no horizontal overflow or page errors; screenshots reviewed                             |
| Local validation                     | 42 unit/API/release tests, fresh SQLite/local D1 migration/seed checks, lint/types/config/build, 8 desktop/mobile browser checks |

The initial [release run](https://github.com/hmarquardt/cheapseggs/actions/runs/44758973504) failed smoke checks after deployment: first DNS propagation, then a missing asset revision header. The header was fixed with browser regression coverage. The [next run](https://github.com/hmarquardt/cheapseggs/actions/runs/44760304315) passed validation and published the verified release, but its immediate smoke saw the prior Worker during propagation. Independent checks subsequently passed with the exact new SHA/version. A further [run](https://github.com/hmarquardt/cheapseggs/actions/runs/44761180296) exposed a mixed-edge case: version was current while the following health response still carried the prior SHA. Independent full smoke then passed for `488a931b74b7424b5dfc72b7519a8736a43daee0` / Worker `782ae234-ae08-440c-a14b-46a4616a86a2`, including plain-HTTP to HTTPS redirect. The verifier now requires the exact revision per response within a shared propagation deadline. Four release-boundary tests cover mixed revisions, missing revision exhaustion, immediate application failure and network failure handling; no application/security assertion is relaxed. These failed runs are retained as evidence, not described as successful releases.

### First complete automated release

[GitHub run 44761879392](https://github.com/hmarquardt/cheapseggs/actions/runs/44761879392) completed **successfully**: [validation](https://github.com/hmarquardt/cheapseggs/actions/runs/44761879392/job/136376244096) and [deployment plus production smoke](https://github.com/hmarquardt/cheapseggs/actions/runs/44761879392/job/136377078098) are green. Commit **`4e69dd1b767953b0830d39f13fed0bc28e5072c9`**, Worker version **`ec52da3e-28c6-4039-9fdc-5e032aaf15d2`**. CI smoke time: **2026-11-20T15:20:18.228Z**. The downloaded `production-verification` artifact and independent local live check (**2026-11-20T15:20:49.340Z**) agree on both identifiers. Cloudflare's version API also confirms the same Git SHA in `workers/tag`, and the control plane reports Workers.dev and preview URLs disabled.

This completes the automated delivery gate. Subsequent documentation releases are still required to pass the same pipeline and are identified by their own artifacts/runtime version; the evidence above is an immutable successful checkpoint, not a promise that no later commit will be deployed.

Every later main release must complete validation, deployment and smoke in [GitHub Actions](https://github.com/hmarquardt/cheapseggs/actions/workflows/ci.yml). Its `production-verification` artifact records the deployed SHA, Cloudflare version and check time. Read `https://cheapseggs.com/api/version` for the current identity; documentation commits also release, so the first verified identity above is historical evidence rather than a hardcoded current version.

## Remaining product gates

Authentication/session/recovery proof, adult-access and legal review for intended markets, a reviewed real activity catalog, private support channel, private resource authorization/inference defenses/deletion/restore drills, and processor underwriting precede their respective features. The next product milestone is a real bounded guest Discovery Wheel. Chemistry Check should follow the first playable Wheel and its independent identity/privacy gates; compatibility never establishes consent or couple membership.
