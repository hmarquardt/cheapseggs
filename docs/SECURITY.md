# Security, abuse and compliance review

## M3A status (supersedes historical disabled-identity statements above)

Better Auth 1.7.27 email OTP, native D1 sessions and Cloudflare account email are implemented. Current threats/controls, exact lifetimes, advisory review, CSRF policy, abuse budgets and deletion/restore restrictions are in [AUTH.md](AUTH.md). New catalog versions default to restricted and are excluded from every guest read; only the frozen reviewed M2 manifest is public. No age provider or restricted-content market is enabled; see [AGE_ASSURANCE.md](AGE_ASSURANCE.md). No document, intimate response, private activity approval/history, couple sharing or billing data is collected by M3A. No E2EE claim.

Threat model date: 2026-11-19. This is a design review and release checklist, not a security certification. The foundation stores only non-explicit fixtures. Private-data, billing and identity APIs remain disabled.

**Public release extension, 2026-11-20:** deployment is now authorized for the non-explicit public foundation. Production has no functioning identity/session system and sets no authentication cookies; unfinished auth/payments return 503 and private assessment/couple paths return generic 404/no-store/noindex. Only three reviewed non-explicit samples are seeded, with no user/test account or private-response data. `wrangler.production.jsonc` separates bindings from local emulation and disables request logging. Social metadata and WebSite JSON-LD are static, with exact hash-based CSP permission rather than unsafe-inline. Optional CFLab fetches are consented and public-path allowlisted; raw URL/referrer/answer/session identifiers are excluded. Real private/erotic functionality still requires all existing gates. [Deployment](DEPLOYMENT.md) and [Analytics](ANALYTICS.md) document boundaries and actual evidence.

## Assets, actors and trust boundaries

Highest impact assets: private answers/exclusions, membership and match disclosures, identity/session credentials, deletion state, billing identity and entitlement integrity. Attackers include unauthenticated bots, compromised users, a deliberately probing partner, a former partner, abusive invite senders, malicious content contributors, compromised dependencies, and operational administrators. A partner is an independent partially trusted actor; membership is not authorization to read private responses.

Browser state and all request fields are untrusted. Boundaries: browser ↔ Worker; Worker ↔ D1; Worker ↔ email/auth/age/payment providers; public ↔ private media; support ↔ operational administration. Cloudflare administrators/runtime and our deployment authority remain trusted for processing. Private answers are not needed by marketing or billing.

## Threats and mitigations

| Threat                                    | Required controls / verification                                                                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account takeover, inbox compromise        | Framework auth, optional passkeys, verified linking/recovery, recent-auth credential changes, device revocation; test scanner/replay/recovery cases                                            |
| Session hijacking/fixation                | Secure HttpOnly host-only cookies, short idle/absolute lifetimes, rotate on promotion/sign-in, D1 revocation authority; no token localStorage                                                  |
| CSRF                                      | Trusted exact Origin and Fetch Metadata checks, framework protections and reviewed CSRF token for app mutations; test foreign/null origins and form POST                                       |
| Stored/reflected XSS                      | No raw HTML from catalog/UGC; JSX/text encoding, strict CSP, safe URL allowlist; no third-party scripts or arbitrary image URLs                                                                |
| Broken object authorization               | Every repository query binds current user + selected relationship membership; generic 404 for foreign/private IDs; cross-account matrix tests before routes open                               |
| Invite spam, replay and takeover          | Hashed high-entropy single-use tokens, 48h expiry, explicit independent acceptance, fresh auth, CSRF, rate limits, transactional slot allocation; no lookup by token that reveals private data |
| Preference probing/count leakage          | Fixed rounds, explicit release by both, no negative/count/progress API, no arbitrary filtered match queries/custom probes; privacy attack review required                                      |
| Hidden rejection disclosure               | Never serialize hard-NO/NO/MAYBE/unanswered labels for others; generic ineligibility and fixed-shape matching; positive disclosure limits explained                                            |
| Stale recommendations after revocation    | Consent epoch and catalog revision on every read/use, primary D1 reads, final conditional write; test concurrent edit/spin/leave and no KV security cache                                      |
| Shared-device disclosure                  | In-memory guest state, private responses no-store, no service-worker/offline cache, discreet non-explicit notifications, clear/exit controls; caution that browser history/screenshots remain  |
| Sensitive browser cache / back navigation | Private JSON `Cache-Control: no-store`, clear UI on logout/pagehide and reauthenticate/revalidate on return; no private HTML in static assets; test bfcache separately at M4                   |
| Sensitive logs/metrics                    | Disable bodies, tokens, URLs with queries and private IDs; no default request logger/error SQL dumps; allowlist event counters and bounded security codes                                      |
| Private/premium asset leakage             | Separate R2 buckets, no public domain for private bucket, authorize every Worker read; opaque IDs are not authorization; short/no-store responses and no broad signed URLs                     |
| Entitlement bypass                        | Server-side active grants + timestamps + current membership; client pack state cosmetic; test expiry/refund/separation, and keep eligibility check separate                                    |
| Forged/replayed payment events            | Exact provider mechanism or authenticated lookup, raw-body verification where supported, unique event ID/digest, stable transaction uniqueness, durable atomic fulfillment                     |
| Out-of-order/duplicate purchase/refund    | Monotonic source state transitions, no late-paid resurrection, full-refund source revocation, reconciliation before acknowledging ambiguous state                                              |
| Admin compromise                          | Hardware MFA, separate DB/deploy/support roles, no intimate-data admin browser or impersonation, emergency time-bound break-glass, action-only audit; founder privilege is a residual risk     |
| Deletion/backup resurrection              | Immediate access revoke, bounded purge, backup aging, external deletion ledger and quarantine restore; test restoration before launch                                                          |
| Dependency/supply-chain compromise        | Exact lockfile, npm ci, supported auth patches, least-privilege CI, no deployment secrets in PR jobs, review dependency scripts/updates                                                        |
| UGC abuse and coercive scenarios          | No UGC, private chat/photos or public profiles in MVP. Later requires moderation, reporting, illegal-content handling, content/performer rules and specialist review                           |
| Catalog hazards                           | Editorial approval, versioning, category opt-ins, role/supply/accessibility requirements, withdrawal kill switch; no unsafe activity instructions or blanket Habanero opt-in                   |

## HTTP/input/secrets baseline

Implemented baseline: CSP `default-src 'self'`, script/style/connect/img self, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'self'`; frame denial, nosniff, no-referrer and disabled camera/microphone/geolocation. Static `_headers` and Hono API middleware are separate. No inline script, font CDNs or third-party runtime assets. HSTS for future HTTPS; do not add includeSubDomains until all subdomains are inventoried. Future Turnstile/payment embeds require narrowly reviewed CSP changes; prefer hosted redirect checkout.
Zone-level tagging is a boundary to watch: this zone has Cloudflare Web Analytics enabled, so the edge
injects `static.cloudflareinsights.com/beacon.min.js` into HTML responses (including `/play/`). CSP
refuses it before execution — a production Chromium run on 2026-11-20 recorded the violation and no
beacon payload — and the recommendation is to disable Web Analytics in the dashboard rather than add
it to `script-src`.

Before new endpoints: Zod validation with strict objects, bounded arrays/strings and enums, content-type checks, 16 KB typical JSON body limit (lower where possible), pagination ceilings, URL allowlists, prepared D1 SQL and fixed allowlisted identifiers. Return generic errors; internal audit codes cannot include response values. Rate limits must be distributed; in-memory counters are not enough. Use per-route CPU/time caps and bounded recipe search/catalog size. Do not make guest requests a free unlimited email or compute service.

Store secrets only in environment-specific Workers secrets/ignored local `.dev.vars`. Never `VITE_*`, GitHub artifacts, tracked Wrangler vars or output. Scope Cloudflare tokens to necessary resources and avoid CI credentials until approved deployment work. Billing cards stay at hosted checkout; no PAN/CVV or raw financial credentials ever in D1/logs.

## Adult access and market scope

Recommend US English first **only in a counsel-approved subset of jurisdictions**, with no live intimate product until actual catalog classification and jurisdiction matrix are reviewed. Do not assert that text-only erotic games are exempt. States differ in definitions, thresholds, pending litigation and age-verification requirements; a server-rendered checkbox is not a universal solution.

[Texas Chapter 129B](https://tcss.legis.texas.gov/resources/CP/htm/CP.129B.htm) addresses specified commercial sites where more than one-third is sexual material harmful to minors, with age-verification duties. [Free Speech Coalition v. Paxton (Supreme Court, 2025)](https://www.supremecourt.gov/opinions/24pdf/23-1122_3e04.pdf) upheld the challenged age-verification requirement under intermediate scrutiny. These are examples of material legal constraints, not a nationwide clearance or a complete current state-law survey; statutory text can include provisions affected by separate litigation.

For UK services in scope publishing pornography, [Ofcom](https://www.ofcom.org.uk/online-safety/protecting-children/age-assurance) requires highly effective age assurance; [its FAQ](https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/enforcement/highly-effective-age-assurance--frequently-asked-questions-faq.pdf) says self-declaration is insufficient. UK launch is deferred. EU member-state age rules and platform obligations require separate review; do not turn on worldwide availability based on a US decision.

Age assurance adapter should return a minimal over-18 assertion with method, policy version, jurisdiction policy and expiry, not retain government ID/selfie/raw date of birth. Validate signed vendor assertions, audience/expiry/replay, provider privacy and region-specific adequacy. Account, session and adult-access expiration are separate. IP geolocation may inform policy routing but VPNs/mislocation mean it is not proof of age/residence; unsupported/uncertain conditions fail to a neutral unavailable flow. Turnstile, OAuth and possession of a payment card are not age assurance. Store no identity documents in CheapSeggs. Vendor choice/cost remains unresolved and can materially change economics.

No minors or age-play/teen/childlike sexual themes, coercion, exploitation, nonconsensual scenarios, incapacitated participation or dangerous activities. Content stays adult and opt-in. Higher-risk kink topics require an experienced content/safety reviewer before release; launch scope excludes dangerous techniques and instructional how-to. Provide context/boundary/stop metadata without making medical claims. No activity is “safe” simply because a flag is absent.

## Privacy and consumer-protection review

Sex-life/sexual-orientation data is special-category data under [GDPR Article 9](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng). If EU/UK processing is offered, obtain specialist advice on lawful bases, explicit consent, withdrawal, DPIA, minimization, processor agreements, transfers and rights handling. Do not assume account terms or paying for a pack provide an Article 9 condition. [California’s statute](https://cppa.ca.gov/pdf/20260101_ccpa_statute.pdf) includes analyzed sex-life/orientation information as sensitive personal information; applicability thresholds and other state sensitive-data rules need review. Adopt privacy-protective defaults even below thresholds.

Underage reporting must not lead to retaining the reported child’s sexual preferences. Disable access and follow a reviewed incident/deletion process. An adult-only label does not resolve actual-knowledge responsibilities; [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) directs readers to its revised rule. Do not target children or use childlike sexual branding.

Before selling, counsel reviews digital-sales tax, refunds/withdrawal rights, automatic-renewal/cancellation laws by market, clear trial disclosures, accessible cancellation, pricing/discount claims, gift expiry/stored value, affiliates and statement descriptors. The public privacy page is currently a transparent preview explanation, not final legal terms. No consent dark patterns, health/therapy claims, invented testimonials or fake scarcity.

## Security release gates

### M2 guest wheel controls (implemented 2026-11-20)

- Catalog: strict validation at build and read time, unreviewed drafts excluded from
  wheel segments, category opt-in derived from the database flag (upserted so a stale
  row cannot silently drop a consent gate), withdrawal effective on the next request
  because nothing is cached.
- Selection: client sends no candidate list, seed, weight or winner; crypto randomness
  with rejection sampling; duplicates resolved by a unique idempotency key.
- Guest state: no cookie and no browser storage; only a keyed request fingerprint and
  catalog reference are persisted for 24h; explicit reset; bounded per-session budget;
  bounded lazy purge. No spin, boundary or result is logged or sent to analytics.
- Fingerprint privacy (M2.1, 2026-11-20; key made mandatory same day): the persisted
  idempotency value is `HMAC-SHA-256(SPIN_DIGEST_KEY, domain ‖ canonical request)`. The
  preimage is a boundary configuration with a small, enumerable input space, so an unkeyed
  hash would let a database or backup reader recover heat, opt-ins and hard-NOs offline.
  With a key it only proves "same request". **There is no unkeyed fallback**: the spin
  endpoint validates the key before touching guest state and returns a fixed
  `503 unavailable` when it is missing, short, over-long or malformed, writing nothing.
  `GET /api/version` reports `spinDigestKeyed` with the same rule; the production release
  check rejects `false` and separately requires a successful live spin, so a misconfigured
  deployment is a failed release rather than a quieter one.
- Abuse protection (M2.1, 2026-11-20): Cloudflare rate limit bindings
  (`SPIN_RATE_LIMITER` 40/60 s, `WHEEL_RATE_LIMITER` 120/60 s, keyed by client address)
  guard the two public endpoints. Counters stay in Cloudflare infrastructure, no address or
  identifier reaches D1 or logs, and the check fails open. Limits are approximate and
  per-location, so they are a speed bump, not a security control; the per-session budget
  and the 4 KiB body cap remain the backstop. Exceeding them returns
  `429 rate_limited` with `retry-after: 60`.
- Request boundary: same-origin + Fetch-Metadata check, JSON-only, 4 KiB cap, strict
  schema, unknown category/supply ids rejected, generic error codes.
- Verified by automated unit/integration cases (including concurrent duplicates,
  changed-digest conflicts, foreign sessions, expiry, reset, budget, withdrawal, keyed vs
  unkeyed fingerprints, rate-limited refusal before any guest row exists, fail-open limiter,
  result/wedge identity and repeat avoidance that cannot widen the pool), browser checks
  across desktop/mobile (axe, focus, reduced motion, keyboard, wheel geometry, no
  cookies/storage) and a production smoke that re-runs the gate assertions live and rejects
  an unkeyed or unlimited release.

Open M2-era gates: professional content review for heat 3, moderated adult usability
testing, and any authentication or partner workflow.

### Chemistry Check extension (2026-11-20)

Pre-date participants may know or trust each other much less than established partners. [Chemistry Check](CHEMISTRY_CHECK.md) adds link-forwarding/impersonation, harassment by repeated invitations, account-alias probing, hidden-dealbreaker inference, sparse sexual summaries and coercion to reveal “compatibility” results. Require assessment-specific authorization with no automatic couple creation, separately approved derived disclosures, fixed versioned decks/snapshots, pair/family release budgets, neutral block/withdrawal/expiry responses and no counterpart progress. Test that changing a private-only answer or hard rule cannot change any shared score, flag, prompt, coverage, availability or error branch. Payment never buys another person's answers, release permission, intimate-topic opt-in or ongoing access. No safety/identity verification or predictive/psychometric claim follows from a result.

Before collecting real assessment data, complete auth/adult access, encrypted-envelope review, cross-account/accept/release/withdrawal race tests, abuse controls, retention/purge/restore and informed disclosure testing. Apply the existing sensitive-data legal review to dating goals, beliefs and intimate responses too. The assessment can precede couple features only after equivalent privacy primitives are ready; the absence of a couple relationship is not a reason to lower the gate. No new feature code or data collection is enabled by this specification.

M1b: auth workerd proof and recovery/abuse tests. M2: strict catalog validation, unbiased selection and reduced-motion accessibility. M4: independent privacy review, malicious-partner/inference exercise, cross-account authorization, concurrent revocation tests, encrypted-envelope review and deletion/restore drill. M5: written underwriting, authenticated-event sandbox tests, out-of-order/refund/chargeback/cancellation reconciliation. Public adult content additionally requires market/age-access clearance. None of these future gates is satisfied merely by 32 passing foundation tests.
