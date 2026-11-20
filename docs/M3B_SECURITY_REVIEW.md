# M3B independent security and integration review

Reviewed 2026-11-20 against release `6f23a6d4d5d21ed2db10f8d429e5bf4aafd55deb`.
Bounded source review, adversarial local SQLite/workerd/API tests, build inspection,
and desktop/mobile browser checks. No load testing, real email, or private user data
was used. No critical/high finding or exposure of the 17 restricted drafts was found.
This is not a security certification.

## Verified findings and corrections

| Severity | Finding                                                    | Verified impact and correction                                                                                                                                                                                                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Medium   | Spin replay skipped current eligibility                    | Replaying a valid request could return shortlist items outside its heat/exclusions; a paired result survived newly required category approval. Refilter the entire replay pool under current policy; validate both pair members, incompatibility and combined budget.                                                                                                                                  |
| Medium   | Recipe requirements bypassed by mutation paths             | A nonempty `keep` forced a recipe without checking its requirements; step replacement likewise ignored recipe requirements. Both now check mood, heat, experimentation, environment and required opt-ins/exclusions. Only the recommended time band can be bypassed for re-timing; the actual total budget remains enforced. The public activity pool already prevented restricted activity injection. |
| Medium   | Body limits applied after buffering                        | Date Night read the entire body and counted UTF-16 characters as bytes. A shared streaming reader now caps Date Night at 8 KiB and spins at 4 KiB, cancels oversized streams and rejects malformed UTF-8/JSON without database access. Tests cover multibyte chunks and missing/false Content-Length.                                                                                                  |
| Low      | Companion references lacked complete integrity constraints | Migration 0005 protected INSERT only; UPDATE could create half/missing/restricted references, and parent deletion/key changes could orphan companions. Append-only 0006 adds a composite FK, paired-null CHECK, insert/update publication triggers and companion index, preserving existing rows. This required a privileged database mutation; no public arbitrary-SQL path was found.                |
| Low      | Free recipe reads ignored pack gating                      | Marking a recipe or referenced activity as commercially gated still allowed cookbook detail disclosure. Free recipe/activity loaders now require `pack_id IS NULL`. Production has no paid packs; this was a latent policy defect, not evidence of an exposed premium product.                                                                                                                         |
| Low      | Client plan reference validation gaps                      | Duplicate or nonexistent keep positions were silently collapsed/ignored, duplicate target positions could pass, and kept steps could exceed slot pacing. Reject those references and enforce slot limits. Current activity publication, version and eligibility remain server-derived.                                                                                                                 |
| Low      | Date Night did not run guest expiry cleanup                | Date Night-only traffic accumulated expired nonce rows until someone used the wheel. Both mutation routes now run the existing bounded best-effort purge; database failures return generic 503. No recipe inputs or results are stored.                                                                                                                                                                |
| Low      | “Not tonight” could immediately return the same idea       | Its settings update was asynchronous and the replacement used the previous exclusions. Send the current activity in the bounded avoidance list immediately; existing exclusions remain in config. This also avoids overflowing the 40-entry avoidance bound with the separate 60-entry exclusion list.                                                                                                 |

Seven targeted API regressions were run against a detached copy of the original
release and failed as expected, then passed with these corrections. The streaming
attack was tested only with the bounded reader to avoid intentionally exhausting
local memory. Additional migration, account, privacy and browser regressions verify
the remaining changes.

## Migration and deployment safety

0005's additive defaults preserve pre-M3B wheel/spin behavior. Its SQL is intentionally
one-time, not raw-file idempotent: replaying `ALTER TABLE ADD COLUMN` is invalid.
[Wrangler migration tracking](https://developers.cloudflare.com/d1/reference/migrations/)
records applied filenames; a second local migration application reports no pending
migrations. Seeds are independently repeatable. 0005 was not edited.

0006 copies every spin column before replacing the child table. No table references
`guest_spins`; account tables/triggers are untouched. Tests cover pre-M3B single
spins, existing M3B pairs, FK/cascade behavior, publication withdrawal, parent-key
changes, and rollback on malformed legacy rows. An invalid legacy companion aborts
rather than silently deleting history. The normal release first records a D1 Time
Travel recovery point, applies migrations and seeds, then deploys the tagged main
commit. [D1's foreign-key semantics](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
were rechecked; enforcement is never disabled.

## Boundaries verified

- All 17 drafts remain restricted/heat 3/unpublished in both seeds, off every wheel.
  Anonymous and actual Better Auth self-declared sessions receive generic 404 on
  direct content reads. Both account states were exercised against every cookbook
  detail, wheel config, substitutions, forged keeps and all four wheel modes.
- Stale client steps are rejected after withdrawal, draft/restricted/verified-tier
  reclassification or commercial gating. Unknown identity/entitlement fields,
  cross-site requests, malformed inputs and rate-limit denials do not widen policy.
  Plan replay/concurrency creates no saved plan or duplicate guest row.
- The public build scans every emitted asset for every draft ID, title and description.
  An injected draft marker makes the build fail. Editorial seeds and source files
  are server/build inputs, not public assets. No restricted-content client import or
  error-message reflection was found.
- M3B changed no Better Auth configuration, account service/routes or generated auth
  schema. Existing OTP replay/concurrency, session expiry/revocation, recovery,
  category-approval withdrawal, fresh-auth deletion and disabled age-provider tests
  remain green, including compiled workerd/D1. `npm audit --omit=dev` reports zero
  advisories; the [upstream advisory list](https://github.com/better-auth/better-auth/security/advisories)
  was rechecked. Self-declaration still does not unlock restricted content.
- Date Night stores only an opaque nonce and timestamps in `guest_sessions`; no
  plan, opt-ins, exclusions, configuration digest or recipe result is persisted.
  Spin history retains its existing 24h public-result/HMAC contract; that is distinct
  from private play, which is disabled. No new logging, analytics or external calls
  were added. Browser tests observe no experience analytics, cookies or storage.

## Validation and residual risks

`npm run check`, actual local D1 migration twice, seed twice, FK check, and the full
34-case desktop/mobile browser suite passed. The focused audit adds 19 unit/API/SQL
cases and two browser cases (one test on both projects). The full local unit/integration suite passed all 163 cases. The
exact deployed commit, Actions run, `/api/version` and Worker version are recorded
in the release handoff and its `production-verification` artifact.

Date Night loads four catalog queries (109 public versions, 12 recipes and their
steps). A fresh valid nonce normally totals nine D1 statements; reuse totals seven,
including two bounded purge statements. Replacing an expired nonce can use twelve.
No query is issued per user-supplied exclusion/keep/avoid entry. Inputs cap keep/step
references at 12, opt-in/supply/category lists at 16, exclusions at 60 and avoid at 40;
composition is bounded by the trusted catalog and these caps. Recipe metadata and
catalog growth remain trusted editorial/deployment inputs, not caller-controlled.

The shared Cloudflare limit is 40 POSTs/minute/client/location and 120 catalog
reads/minute/client/location. It is approximate and intentionally fails open on
binding errors; rotating addresses/locations/nonces can evade it. There is no global
cost ceiling or per-session Date Night budget. No global limiter, scheduled cleanup,
new service or recurring charge was introduced in this bounded review. Lazy cleanup
requires subsequent traffic and may lag after outages. Account cookies have no effect
on public selection. Live signed-in probing was done locally to avoid creating real
production accounts; production verification uses anonymous, non-destructive smoke.
