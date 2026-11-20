# CFLab analytics integration

Integration date: 2026-11-20. CheapSeggs uses the existing CFLab Analytics collector, not a new analytics service, database, scheduler or Google client script. Implementation lives in `src/client/analytics.ts`; public configuration is in `src/config/site.ts`.

## Verified current contract and registration

The source of truth inspected locally was `~/aismallbizguru-cflab/docs/ANALYTICS.md`, `analytics-ui/script.js`, `src/analytics/api.ts`, `collector.ts` and `migrations-analytics/0002_sites.sql`. Canonical collector: `POST https://analytics.aismallbizguru.com/collect`. Site public ID: **`as_v3ng10kbDYMLWnFWOsf52W`**, slug `cheapseggs`, reporting row ID 11. Domains: apex primary, `www` alias. Timezone: America/Chicago. Raw retention: **7 days**, DNT/GPC respected. This identifier is public instrumentation configuration, not a credential.

No authenticated CFLab administrator browser session was available. Following the operator-provisioning convention documented for other sites, registration used authorized Cloudflare-account D1 access to create **only** this site and its two domain rows, matching the documented site API shape and active administrator ownership. Analytics Time Travel bookmark before the write: `00000a58-00000000-00005129-795ce9eb7be6e77d003fdee14f4437dd`. No identities, passwords, sessions, security policies, collector code or other repository were changed. The normal API/dashboard remains the preferred registration path. Re-read the row/domain configuration after registration; do not create another site if restarting this task.

Dashboard URL: `https://analytics.aismallbizguru.com/?site=as_v3ng10kbDYMLWnFWOsf52W`. Administrator/site-authorized login is required. Database registration/readback is not by itself evidence of event ingestion or an authenticated dashboard rendering. Live ingestion verification must read the reporting records after a real opt-in pageview; the launch report records the actual result.

## Why a minimal first-party adapter

The canonical CFLab script automatically records pathname, UTM values, referrer and a sessionStorage identifier. CheapSeggs needs stricter minimization, so it uses the **existing collector payload contract** with a small first-party adapter. This is not a newly invented endpoint or tracking ID. No external tracking script is loaded, and there is no second automatic pageview emitter.

Allowed payload fields only: `site`, `kind`, `name`, an exact allowlisted public `path`, and fresh per-event `event_uid`. No session/person identifier, props, raw query, fragment, UTM, referrer, invite token, answer, result, heat/category, dealbreaker, recipe contents or partner identifier. The collector derives coarse device/browser/geography and processes network information for delivery/abuse control under its existing contract. Counts cannot be described as unique users or perfectly anonymous network access.

## Permission and duplicate prevention

No collection until the visitor selects **Allow analytics**. The only persistent browser value is `cheapseggs.analytics.consent=granted|denied`, with no identifier. DNT or GPC overrides consent. Blocked localStorage falls back to an in-memory choice. Only exact public pathnames on `cheapseggs.com` can emit; local development, aliases before redirect, `/play/`, private paths and arbitrary URLs cannot emit automatic pageviews. Query/fragment values are never read for analytics. Requests use credentials omit and no-referrer.

The public module is included once in generated public HTML. A per-document guard permits one pageview when permission first exists; toggling permission off/on cannot double-count that page. A full navigation/reload is a new pageview. Retried collector writes can use `event_uid` deduplication, but this adapter does not retry blindly. No beacon and fetch duplication, navigation listener or duplicate canonical CFLab script is installed.

## Event contract

Currently emitted: **`pageview` only**, after permission on a public page. Visiting a feature explanation or entering the design preview is not a completed game/assessment. Future allowlisted product events are defined but **not emitted**:

| Event                        | Required real trigger before wiring                          |
| ---------------------------- | ------------------------------------------------------------ |
| game_started                 | A working game begins, not a preview navigation              |
| wheel_spun                   | Server-validated real result selected                        |
| recipe_generated             | Valid coherent plan generated                                |
| chemistry_check_started      | Real independent assessment started                          |
| chemistry_check_completed    | Defined mutually released completion, never a score/category |
| partner_invitation_initiated | Real invitation durably created                              |
| partner_invitation_accepted  | Independent acceptance committed                             |
| purchase_flow_initiated      | Valid approved hosted checkout intent created                |

Before those workflows exist, revisit privacy and aggregation: the current public-only adapter intentionally refuses private-route emissions. A future server-side aggregate counter or reviewed coarse feature-path adapter must never pass real assessment/invitation URLs. Do not broaden `PUBLIC_PATHS` to include private pages simply to get a metric. Do not add arbitrary event properties. No result-dependent marketing, cross-site tracking or sexual preference profiles.

## CSP and validation

Only `connect-src https://analytics.aismallbizguru.com` is added; script-src remains self plus the exact static JSON-LD hash. No wildcard, unsafe-inline or Google tracking script. Unit tests validate opt-in, DNT/GPC, host/path denial and exact payload keys. Browser tests route the production origin to the local Worker and mock the collector, verifying no emission before permission, no URL leakage, one pageview, private-route exclusion and DNT suppression. These mocked tests do not prove live ingestion; live verification is separate.

No third-party purchase or new CFLab infrastructure was enabled. Its existing shared hourly retention/aggregate jobs govern this site. Raw retention is seven days; aggregate lifetime follows the existing platform, not a newly implemented per-site 13-month purge. Access to CFLab reporting never becomes CheapSeggs customer authentication.
