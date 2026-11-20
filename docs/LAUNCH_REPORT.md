# Public launch evidence

## M2.1 privacy and abuse hardening release (2026-11-20)

| Item                     | Observed                                                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release                  | commit `44b8b309938d805f976aaaf12921cb7a0143d90f`, Worker `d844edbe-3029-48e9-80d1-30a22e236faa`                                                                           |
| CI                       | [run 44784610515](https://github.com/hmarquardt/cheapseggs/actions/runs/44784610515) — validate, deploy and independent smoke all passed                                   |
| `/api/version`           | revision matches the pushed commit; `spinDigestKeyed: true`; `rateLimits {spin: true, wheel: true}`                                                                        |
| Worker secret            | `SPIN_DIGEST_KEY` set once with `wrangler secret put` and still bound after deploy; the production check rejects an unkeyed fingerprint, so losing it cannot ship silently |
| Live spin                | `Set the soundtrack` on a real spin; the wedge under the pointer equals the winner marked in the ordered list; captions inside the rim; no horizontal overflow             |
| Guest privacy in browser | 0 cookies, 0 `localStorage`/`sessionStorage` entries after acknowledgement, spin and result                                                                                |
| CSP                      | one violation: `static.cloudflareinsights.com/beacon.min.js` refused by `script-src 'self'`; no beacon payload sent                                                        |
| Evidence                 | `artifacts/production-smoke.json`, `artifacts/production-wheel-m2-1.json`, `artifacts/production-wheel-m2-1.png`                                                           |

Fixed in this pass: the persisted fingerprint is HMAC-keyed (a database reader can no longer recover
heat, opt-ins or hard-NOs by enumeration), the public endpoints carry Cloudflare-native per-location
rate limits that store nothing in D1, wheel captions no longer overflow their wedges, the disc is no
longer an empty circle before the first spin, optional sound ticks again, and "not tonight" can no
longer push exclusions past the server bound.

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
