# C1.1 independent adversarial security audit — 2026-11-20

**Recommendation: DO NOT APPROVE a controlled private beta yet.** Remediations improve the technical
boundary substantially. Operational restore/deletion continuity, purge monitoring, informed disclosure,
identity-confirmation usability and the existing private-service legal/adult-access gates remain open.
This audit does not authorize activation. Production must retain both private flags unset and no
Chemistry envelope key. The public demonstration remains available.

Baseline reviewed: `39374a900b7d21e9f3a9356edae528ed5430aeef`. This document and its accompanying code
constitute the remediation; `git rev-parse HEAD` identifies the release source. Exact Actions run,
release commit, Cloudflare version/tag and independent live evidence are recorded in the completion
report after deployment; do not infer deployment from this document's existence.

## Confirmed findings, ranked by impact

Severity describes the private-enabled implementation's impact. The production gate prevented these
paths from collecting real responses during the audit. No evidence of exploitation of real data was
found or claimed. Test fixtures use synthetic responses and test-only keys.

| ID    | Severity           | Reproduction / impact                                                                                                                                                                                                                                                                                   | Correction and regression evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1-01 | High               | Final result insertion checked only absence of a result; its trigger checked epoch/status. It did **not** check the approvals or submission digests claimed in the handoff. Pause report encryption, narrow an approval, resume: the baseline releases the earlier wider report.                        | Conditional insertion now binds both identities, exact ciphertext digests/revisions, both approval digests, scope deadline, manifest/algorithm, active users/declarations, epoch and caller session. Both HTTP and actual D1 barrier tests deny the stale release.                                                                                                                                                                                                                             |
| C1-02 | High               | Hard-conflict evaluation scanned the entire manifest even when category scoring was restricted. A dealbreaker in an excluded category, including intimacy without mutual intimacy approval, changed the shared hard signal.                                                                             | Hard checks now use only intersected dimensions and mutually approved intimacy. Changing excluded requirements produces byte-identical reports in the regression.                                                                                                                                                                                                                                                                                                                              |
| C1-03 | High               | Draft/submission writes checked lifecycle before encryption but updated participant rows afterward without current lifecycle guards. Withdrawal could finish and clear data, then the old request could store ciphertext again.                                                                         | Conditional writes check epoch, exact old revisions, active lifecycle, deadline, withdrawal and the resolved Better Auth session at the write. Downstream invalidations bind the unique new envelope/digest. HTTP and real D1 reproductions assert zero repopulated envelopes.                                                                                                                                                                                                                 |
| C1-04 | High               | A read could copy a report/draft, then return decrypted data after withdrawal, account deletion or session revocation completed. Draft expiry relied on cleanup. Shared reads did not check both participants' current adult declarations.                                                              | Sensitive reads have a final joined primary-state query after decryption, including grant/revision/deadline, current participants/declarations and caller session. Release returns through the same reader. Withdrawal, deleted account, revoked session, expired declaration and backlogged expiry cases deny access. A response authorized at this final query is already in flight and cannot be recalled.                                                                                  |
| C1-05 | High / operational | Restoring a pre-withdrawal/pre-deletion snapshot with its retained key resurrects the deleted account/session, invitation and old report grant. Encryption, an epoch inside the same snapshot, and a ledger restored with it do not prevent this. The handoff's assurance was false.                    | Preserve quarantine. `restore-quarantine.ts` generates reviewable SQL that discards **all** restored assessments and their cascades, all sessions/challenges, and replays a complete external account-deletion ledger. A real SQLite backup drill first demonstrates restored report access, then denies it after sanitation and rejects missing/incomplete ledger coverage. External-ledger continuity is still an activation blocker; this is not automatic restore safety.                  |
| C1-06 | Medium             | Concurrent invitation claims could let a losing claimant terminate the successfully accepted assessment. A losing release could delete the winner's report at the same epoch.                                                                                                                           | Remove destructive loser compensation. Conditional writes/constraints decide ownership; a failed request cannot tear down another request's committed success. Real D1 competing-claim and competing-release tests preserve exactly two participants and one readable result.                                                                                                                                                                                                                  |
| C1-07 | Medium             | Abandoned invited assessments could retain drafts indefinitely. Traffic stopping prevented cleanup; the pair cooldown ledger had no expiry.                                                                                                                                                             | Cleanup now terminates expired invited assessments, clears envelopes, removes expired tombstones/budgets and expires pair-ledger entries after 30 days. Migration 0009 adds expiry indexes. An hourly Worker scheduled handler runs without keys, flags or HTTP traffic. Failures propagate from the scheduled handler; request-time cleanup remains best effort and runs only after authentication. Capacity/monitoring requirements remain below.                                            |
| C1-08 | Medium             | A pre-read pending count admitted five concurrent invitations despite a three-pending cap.                                                                                                                                                                                                              | Migration 0009's insertion trigger serializes the cap. The actual D1 baseline admits five; the remediated burst retains three. The atomic daily counter still caps five creation attempts conservatively.                                                                                                                                                                                                                                                                                      |
| C1-09 | Medium             | `awaiting_release`, approval readiness and detailed unassessed reasons revealed counterpart progress or distinguished sparse/opted-out states.                                                                                                                                                          | Participant views mask collection substates and terminal reasons, omit the approval-validity probe, and use neutral unassessed reasons. A participant can acknowledge their own approval without testing counterpart completion; later submission invalidates that epoch, so it cannot authorize future answers. Tests compare views and acknowledgements before/after counterpart submission. Joint report availability and authorized bands necessarily disclose some aggregate information. |
| C1-10 | Medium             | Private UI mutations without a JSON body omitted the required action/content-type headers; delete used the wrong URL. Withdrawal/deletion buttons therefore failed. Fragment tokens remained in history until successful acceptance. Request budgets and expired adulthood could also block withdrawal. | Correct method/header construction and DELETE routing; remove invitation fragments immediately into memory. Authenticated revocation remains available despite exhausted Chemistry budgets or expired adulthood, with CSRF and participant checks retained. Desktop/mobile transport regressions and HTTP revocation tests cover these cases.                                                                                                                                                  |
| C1-11 | Low                | Submission advanced the draft revision without resealing its draft; reopening it failed AAD validation and could present an empty editor.                                                                                                                                                               | Submission writes a purpose-separated, independently nonced encrypted draft at the new revision in the same batch. An owner-read regression verifies the submitted snapshot is retained.                                                                                                                                                                                                                                                                                                       |

Additional hardening: reject unknown environment names, bind algorithm version in approval material,
validate ciphertext bucket/size and nonempty decoded plaintext, enforce the stored key-version column
against the envelope header, and add a 240-request/account/15-minute budget alongside the network budget.
These changes are defense in depth, not separate manufactured exploit claims.

## Evidence and independence

Baseline `npm run check`: **222 tests passed**, types/lint/config/question bank/auth-schema drift,
migrations/seed/foreign-key checks, frontend/Worker builds and compiled auth lifecycle passed. The
handoff's tests therefore did not establish the missing security properties.

New HTTP/domain adversarial tests failed nine cases against the baseline before fixes. Separately,
`chemistry-d1-races.test.ts` was copied into an isolated archive of the baseline and run against actual
Miniflare/workerd D1: **all seven cases failed** (including five pending invitations). They pass with the
remediation; two further actual D1 barriers verify withdrawal and submission edits during final release encryption. This distinguishes SQLite-adapter tests from actual D1 transactional behavior.

The completed validation suite contains **253 unit/HTTP/local-D1 tests in 18 files**, **40 desktop/mobile
browser tests**, compiled auth and Chemistry Worker scenarios, fresh migrations/foreign-key checks,
question-bank/config/schema validation, lint/types and dry-run builds. The compiled Chemistry check
includes three independent Better Auth accounts, competing claims/releases/creates, foreign ownership,
cooldown, test-key rotation/retirement, scheduled cleanup and **364 disabled route/method checks** across
four partial configurations. Its email transport is intercepted; no message or live assessment is used.
`npm audit --omit=dev` reported zero advisories on the audit date; this is not proof that dependencies
have no vulnerabilities. Full Actions and production smoke must pass for the release SHA.

D1's documented [transactional batch behavior](https://developers.cloudflare.com/d1/worker-api/d1-database/)
does not make an earlier Worker read atomic with a later write. Corrections use conditional SQL and
checked changes inside the batch; they do not assume interactive transactions across crypto awaits.

## Encryption and key management

AES-256-GCM uses nonextractable WebCrypto keys, random 96-bit nonces, 128-bit authentication tags and
512-byte zero-padding buckets. AAD separates draft/submission/report and binds assessment, owner,
revision/manifest, or report epoch/shared-scope digest. Random nonces provide probabilistic uniqueness;
there is no claim of a durable nonce counter. Generated 32-byte keys must be independent per version
and environment. Missing/malformed keyrings, unknown versions, corruption/truncation, wrong purpose,
owner, assessment, revision or manifest fail closed. Errors never return cryptographic details to clients.

Only envelopes/ciphertext digests hold answer content in D1. Scope grants, labels, pair identity,
lifecycle timestamps and approximate ciphertext size buckets remain plaintext metadata; encryption does
not hide the whole database or give per-user crypto-erasure. Source/transport/browser review found no
real-answer storage in logs, URLs, browser storage, analytics or public assets. The public bank and
synthetic demonstration choices are intentionally public. Real submitted plaintext travels over TLS to
the trusted Worker, which encrypts it; the browser does not encrypt it before transmission.

Database-only readers without the separate keys cannot read authenticated payloads. Worker/runtime,
deployment administrator, inbox/session compromise and encryption-key compromise are different threats.
A valid stolen session has the owner's capabilities until revocation; there is no custom auth or E2EE.
An attacker with historical ciphertext **and** its key can decrypt it after primary-row deletion.

Rotation drill: test version 1 data remains readable under version 2 plus retained previous key;
premature removal denies reads; reinstating the test key restores access. Separate tests reseal synthetic
draft/submission/report payloads with unchanged AAD, retire version 1 and verify exact plaintext equality
under version 2. The compiled Worker also tests expiry/purge without a key. This audit does not ship an
online bulk rekey endpoint. For routine rotation, inventory every draft/submission/report key version,
make a fresh key current, retain the old version until every readable old envelope expires/purges, and
verify zero live references before retirement. Backups and active retention are separate inventories.

After suspected key/runtime compromise: close collection, contain deployment access, revoke sessions and
assessment grants, preserve minimal incident evidence, and assume exposed historical ciphertext is
readable. Prefer purging affected assessments and restarting after review; if preservation is required,
reseal in isolation with verified record bindings, compare counts/decryption, and only then retire the
old key. Rotating cannot undo historical disclosure. No production key was generated or provisioned.

## Invitations, release and inference limits

Invitations use 32 random bytes, domain-separated SHA-256 digests in D1, 48-hour expiry, conditional
single use, independent adult/session checks and immutable participant slots. Pair/family uniqueness is
an unordered identity key; no couple or membership is created. Self, replay, expired/revoked and foreign
resource probes fail generically. Revocation/deletion cascades remove access. A trusted external channel
must confirm who joined before submission: **any independent account knowing the link and label can
claim it first**. The label is a typo/context check, not identity verification. UI copy now says so.

Fragments are not sent in HTTP URLs/referrers and are removed from the current history entry immediately.
They remain in memory for deliberate acceptance; nothing stores them in local/session storage. Copy/share
places a bearer secret in the clipboard/recipient's chosen channel. Browser sync, original messages,
clipboard managers, screenshots, malicious extensions and forwarding remain outside this protection.
Users who navigate away to sign in may need to reopen the original invitation; no token persistence or
automatic account lookup was introduced.

Both approvals bind an exact current epoch, own submission revision, manifest, algorithm, deadline and
scope. Each submission advances the epoch and clears both approvals/results, so those grants jointly bind
both immutable revisions. Final release intersects dimensions/opt-ins and checks the exact two grants
again. Edits before release invalidate approvals; an edited draft must be resubmitted. Released snapshots
are fixed: subsequent changes require withdrawal and a new mutually approved assessment/cooldown.

Private-only answer contents, acceptance sets, importance and rules are excluded before scoring and hard
checks; generic report topics never derive from them. HTTP report equality and domain noninterference
cases cover this. Mutation-driven epoch invalidation applies to every edit regardless of private answer
content; it is not a hidden-dealbreaker decision. No client-selected question bank, arbitrary questions,
scoring coefficients, result epoch, owner or scoring configuration is accepted. Clients select only their
own bounded responses and explicit disclosure approval; the server derives the manifest and intersection.

Reports expose no raw answers, directional scores, counts or rule owners. Nevertheless, minimum coverage
and three-band output are not anonymity. A malicious participant can choose narrowly informative own
answers/rules; a jointly authorized hard signal can reveal a useful bit even without naming its rule.
Release availability also distinguishes sufficient joint authorization from unavailable state. Thirty-day
pair cooldown and minimum cells reduce repeated probing, but new account aliases evade pair identity.
There is no information-theoretic or constant-time secrecy claim. Parsing/decryption operate on bounded,
variable-size records; timing tests cannot prove hidden-content secrecy. No known private-answer-dependent
report/error decision remains in the reviewed paths. Consent comprehension and adversarial usability
review remain activation gates, especially around forwarding, signal inference and coercion.

## Deletion, maintenance and restore

Withdrawal atomically revokes epoch/grants and clears both parties' assessment envelopes/results.
Deleting either account triggers assessment deletion/cascades before the user disappears. Expiration
checks authorize independently of cleanup. The hourly Worker handler, also used opportunistically by
authenticated operations, terminates at most 20 expired assessments, 20 abandoned invitations and 20
expired reports per invocation, deletes 20 eligible tombstones, 100 expired budgets and 100 expired pair
ledger entries. Terminal envelopes are cleared immediately; minimal rows have a 24-hour purge grace.

This capacity is intentionally bounded: up to 480/hourly-processed expirations per category per day,
with extra opportunistic capacity. It is **not** an unconditional 24-hour SLA under arbitrary backlog or
outage. Before beta, name an operator, check maximum overdue age/counts and failure status at least daily,
cap enrollment below measured capacity, and validate actual scheduled execution. Scheduled exceptions
propagate rather than being swallowed; no sensitive payload logging is added. No separate paid service
or scheduled CI was introduced. Existing Worker/D1 usage billing still applies.

See [the restore runbook](CHEMISTRY_CHECK_RESTORE.md). A restored epoch, invitation, session or result is
not trustworthy merely because it is old or encrypted. [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
retains database history and can restore deleted state. The restore generator requires externally
attested deletion coverage from before the snapshot through the freeze cutoff; it cannot detect an
operator falsely asserting completeness. Missing coverage means **stay quarantined/offline**.

All restored assessment state is deliberately discarded, so a separate assessment-withdrawal ledger is
not needed for that conservative procedure. The latest account-deletion ledger still must be replayed.
Reconcile the latest cooldown ledger too, or keep private collection closed until cutoff + 30 days to
avoid rolling back anti-probing budgets. Restored sessions and challenges are always discarded. A local
backup/restore drill demonstrates the procedure; no production restore or unreconciled traffic switch
was performed. A durable off-target ledger/export custody arrangement remains unverified and blocks beta.

## Abuse and authentication

Five daily creation attempts/account, atomic three-pending cap, one live pair/family assessment, 30 release
attempts/account/hour and 240 requests/network **and account**/15 minutes use bounded server-side state.
Counters are HMAC keyed with domain/scope/window separation and fail closed on D1/secret failure. Windows
are fixed and allow boundary bursts. Sessions cannot reset account counters; new accounts, different
networks and delete/re-register aliases can evade identity-based budgets. Pair-ledger rows survive account
deletion for the original opaque identities, then expire after 30 days; a new identity is not the old pair.
Do not describe that as robust resistance to account aliases. Reviewed email limits and a controlled
cohort are proportionate initial backstops; add coarse edge abuse controls if observed demand warrants.

Bodies are streaming-capped at 128 KiB, arrays at 100 responses, choices/versions are validated against the
server bank, plaintext envelopes at 64 KiB. Scoring/decryption use bounded manifests; listing is capped at
20 assessments. Expiry indexes bound maintenance scans; participant/approval access is keyed. Authenticated
revocation bypasses Chemistry budgets and adult-declaration expiry but retains CSRF and owner checks.
Unauthenticated status/probes do not trigger cleanup. There is no unlimited anonymous scoring or email API.

Chemistry resolves Better Auth identities/session rules, not caller participant IDs or couple membership.
Sensitive final queries include the framework session id, owner, absolute expiry and idle expiry on primary
D1. Existing account recovery revokes prior sessions; expired/revoked/recovered sessions cannot start a new
Chemistry request. A compromised live session can act as its user; ordinary assessment actions do not
require fresh authentication, while account deletion retains its existing five-minute requirement.
Origin, Fetch Metadata, JSON and action-header checks remain; no CORS or framework-CSRF weakening was
introduced. Existing account, wheel, recipe, Date Night, accessibility and analytics suites remain gates.

## Activation decision

Technical fixes and synthetic drills are necessary but do not authorize real collection. Remaining gates:

1. Founder separately decides whether/when to activate; neither activation flag nor production key is set.
2. Establish and evidence external deletion-ledger completeness/custody and a quarantined isolated recovery
   exercise, including cooldown reconciliation or 30-day private closure. Never route an unreconciled DB.
3. Confirm hourly schedule operation and overdue-age monitoring/capacity with an accountable operator.
4. Resolve existing private-service jurisdiction/adult-access, legal/privacy/support and incident-response
   prerequisites in the existing project documents; this audit supplies no new legal clearance.
5. Validate participant identity confirmation and aggregate/hard-signal disclosure comprehension with the
   intended controlled cohort. Labels do not verify identity and aggregate output can be informative.
6. After a separate activation decision, provision independent production keys through the documented
   secret process and repeat enabled synthetic/staging smoke and informed two-account flows. This audit
   provisions no production secret and enables no real assessment collection.
