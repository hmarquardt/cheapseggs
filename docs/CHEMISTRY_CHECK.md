# Chemistry Check — pre-date compatibility planning

Status: **C1.1 backend implemented 2026-11-20, production-disabled.** The versioned bank, nested manifests, deterministic scorer, account-free demonstration, D1 lifecycle, two-account invitations, encrypted drafts/submissions, mutual release, reports, expiry and deletion are implemented and tested. Production private collection remains **closed**: the gate requires both `CHEMISTRY_PRIVATE_ENABLED` and the independent `CHEMISTRY_PRIVATE_REVIEW_APPROVED`, and the envelope key is absent from production config. See the [security handoff](CHEMISTRY_CHECK_SECURITY_HANDOFF.md).

## Implementation status (2026-11-20)

| Piece                                                                                                         | State                                            | Where                                                                         |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Versioned base bank, 100 original non-explicit questions, eight dimensions                                    | implemented                                      | `src/content/chemistry/questions.ts`                                          |
| Nested 25/50/100 manifests (4/3/13-style prefix allocation, `25 ⊂ 50 ⊂ 100`)                                  | implemented, config-gated                        | `MANIFESTS`, `scripts/check-config.ts`                                        |
| Typed response contract (own answer, acceptance rule, importance, hard rule, disclosure, skip/not-applicable) | implemented with structural validation           | `src/domain/chemistry.ts`                                                     |
| Acceptance-based weighted alignment, reciprocal `min()`, coverage thresholds, coarse bands                    | implemented and unit-tested                      | `evaluateCompatibility`, `buildSharedReport`                                  |
| Separate tri-state hard-requirement evaluation, private-only suppression, joint-signal approval               | implemented and unit-tested                      | `evaluateHardConflict`                                                        |
| One-question-at-a-time demonstration UI, review/edit, synthetic report                                        | implemented, no persistence                      | `/chemistry/`, `src/client/chemistry/`                                        |
| D1 lifecycle, hashed invitations, encrypted drafts/submissions, approvals, reports, expiry/purge              | implemented, production-disabled                 | `migrations/0007`, `0008`; `src/services/chemistry-check.ts`                  |
| Real private submissions or two-person reports                                                                | **implemented behind a two-key production gate** | `/api/v1/chemistry-check/*`; `/api/version` exposes `chemistryPrivate: false` |

The demonstration holds answers in component state only: no cookie, `localStorage`, `sessionStorage`, analytics event or network request carries them. The partner and sample answers are deterministic synthetic data generated in the browser. The `intimacy` dimension defaults to private-only, is marked unshared unless both people opt in, and is non-explicit.

## Purpose, scope and positioning

Two consenting adults who already have initial romantic interest independently explore whether their expectations fit before meeting or starting an intimate relationship. “A little less guessing before the first date.” This is a conversation aid, not a diagnosis, prediction, safety check, relationship verdict or consent certificate. Do not call someone a bad match as a person or suggest a high score makes meeting or sexual activity safe.

Chemistry Check is an invite-only standalone entry point within CheapSeggs. No browsing singles, stranger discovery, public profiles, chat, location matching, compatibility leaderboard or matchmaking marketplace. It can work without either person ever forming a couple or using erotic games. An optional later transition into couples features requires a **new, separate couple invitation and independent consent**, with no automatic answer import.

## Depth and question design

Offer **25 / 50 / 100 questions**, titled Quick Check / A Closer Look / The Full Conversation. These are offered question counts, not minimum required responses. Skipping is always available. Estimated completion time must come from usability testing; do not invent precision. Use nested, editorially fixed manifests (25 ⊂ 50 ⊂ 100) within the same question-bank release, not dynamically chosen questions based on the other person's answers. More questions mean more coverage, not proven accuracy.

| Dimension            | Topics appropriate for the module                                                          |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Relationship goals   | Desired commitment, relationship structure, pace and future expectations                   |
| Lifestyle            | Schedules, social energy, spending habits, smoking and daily routines                      |
| Communication        | Contact cadence, disagreement, space and repair preferences                                |
| Values               | Priorities, family expectations and principles; sensitive beliefs optional                 |
| Affection            | Expressions of care, personal space and comfort discussing touch                           |
| Sexual compatibility | Comfort discussing intimacy, expectations and pacing; optional, no assumed consent to acts |
| Adventure            | Novelty, planning, travel and comfort with spontaneity                                     |
| Humor/personality    | Humor boundaries, playfulness, social style and preferred interaction                      |

Suggested balanced allocation: 25 = 4 goals + 3 each other dimension; 50 = 7 goals + 7 lifestyle + 6 each remaining; 100 = 13 each first four + 12 each remaining. These are editorial hypotheses, not validated scales. Distinct questions must not be redundant rephrasings just to reach a count. Avoid orientation/gender/anatomy as proxies for responses or assumptions of monogamy, marriage, children or religious belief.

Base manifests use non-explicit wording; sexual questions are optional even there. Every more-intimate topic requires the individual's explicit opt-in **before display or answer reuse**. Declining leaves that dimension unassessed, not penalized. Both independently opt in before an intimate expansion is added to a shared assessment. Use a predeclared versioned supplemental deck; identify its extra question count separately from the base 25/50/100. Expansion is a new revision requiring new submissions and release, not a way to query the existing result with a sexual filter. No notice tells one person which topics the other declined. Public acquisition previews remain non-explicit; actual content still needs market/age review.

## Response contract

Each response is keyed by question ID/version, answer-schema version, assessment manifest/revision and owner. Store the following inside the owner's encrypted envelope, with typed server validation:

- **Individual answer:** canonical option(s) or a bounded ordinal choice; no free-text scoring or inferred answer from demographics.
- **Acceptable partner answers:** an explicit set/range or reviewed typed predicate over that question's valid answer domain. Do not silently select “same as me.” `any` is explicit; unset is unknown. An explicit empty accepted set means no answer is acceptable and needs clear confirmation, not treatment as a skip.
- **Importance:** doesn't affect alignment / low / medium / high, provisionally weights 0 / 1 / 2 / 4. These numbers are product policy, not empirically established coefficients.
- **Dealbreaker:** an independent boolean rule applied to that person's acceptable set; never represented merely by a very large weight. May be hard even when alignment weight is zero. Warn clearly about an unsatisfiable hard rule with an empty acceptable set.
- **Privacy/disclosure:** private-only or allowed in an approved category summary; raw answers, accepted sets, priorities and dealbreaker rules stay private. A separate explicit permission controls any joint hard-conflict signal. No per-item raw-answer sharing in the first version.
- **State:** `unanswered`, `skipped`, `answered`, or `not_applicable`, with explicit applicability rules. “Prefer not to say” is a skip, not a substantive answer or refusal of a partner.

An answer without an acceptance specification can be saved but cannot contribute a known directional acceptance check. Missing answers/acceptance are unknown, not agreement, rejection, hard incompatibility or zero-score filler. Show the owner incomplete fields privately. The invitee never sees the inviter's answers, edit timestamps, progress, skipped items or dealbreakers.

## Algorithm proposal: acceptance first, hard constraints separately

All calculations are deterministic, versioned and server-side. Let `x_Aq` be A's own answer; `S_Aq` their acceptable-partner predicate; `w_Aq` their importance. On a question with sufficient known data:

`accepts_A(q) = 1 if S_Aq(x_Bq) else 0`

`accepts_B(q) = 1 if S_Bq(x_Aq) else 0`

Agreement `x_Aq == x_Bq` is a different fact and is **not** the compatibility formula. For multi-select/ordinal responses, use the explicitly selected acceptance semantics; no automatic distance-based “partial credit” or personality-type inference.

For each dimension, define `Q_d` as questions where **both** have answered, both acceptance predicates are specified, both authorize this summary scope, and versions/applicability agree. Use the same comparable set for both directions:

`alignment_A(d) = Σ(q∈Q_d) w_Aq × accepts_A(q) / Σ(q∈Q_d) w_Aq`

Compute B's direction similarly; if either denominator is zero, there is no reciprocal numerical score. Proposed reciprocal alignment = `min(alignment_A(d), alignment_B(d))`; this conservative, symmetric choice prevents one satisfied person from concealing the other's mismatch. Do not expose separate directional scores or which side weighted a question. A future overall descriptive index, if enabled, averages available dimension scores equally and lists omitted scope; never compare scores across depths/manifests as though equivalent. **No overall match percentage in the initial shared report.**

Example: A prefers daily contact and accepts daily or every-few-days; B prefers every-few-days and accepts daily or every-few-days. Both accept despite different answers. Conversely, identical own answers need not mean compatibility if either person's acceptable-partner set excludes that answer. There is no invented “opposites attract” bonus.

Hard checking is a separate tri-state pass: `conflict_detected` if a known partner answer violates either declared hard acceptance rule; `none_detected_in_evaluated_scope` only when all included hard checks are evaluable and pass; otherwise `insufficient_information`. An observed conflict can coexist with unknown checks and a high soft alignment score; retain an internal incomplete-check marker and never summarize this as “all clear.” A missing partner response to a hard question yields unknown. Do not zero, cap or inflate alignment to hide a hard conflict.

Crucially, computation scope follows disclosure authorization. **Private-only items affect no partner-visible score, flag, coverage, suggested topic, result availability, price or timing branch.** The owner can review their own declared rules, but does not receive a partner-dependent outcome for a private-only rule. A hidden conflict must not silently block report release or reveal its presence through a different error. Computing/exposing such an outcome would itself disclose information about the other person. Raw-private-but-summary-authorized is a distinct choice: explain that the resulting band necessarily reveals aggregate information.

Any shared hard-conflict signal is separately authorized by both, says only that an included declared requirement did not align, and reveals neither rule, question, category, count nor owner. If either does not authorize that signal, suppress it without claiming there are no dealbreakers. Do not generate tailored prompts from hidden rules. Neither payment nor another person's approval can change this scope.

## Coverage and shared presentation

Default shared output is a category-level conversation card, never a raw response comparison or a public verdict. The eight dimensions are always named, but each can be unassessed. For non-intimate dimensions, propose coarse bands (largely aligned / some differences / worth discussing) only with at least 3 jointly included comparable items and nonzero weights from both. Illustrative cutoffs are ≥80%, 50–<80%, <50%; they are unvalidated editorial rules. At 50/100 depth, numerical descriptive indices could be tested only with at least 5 comparable items per dimension and explicit disclosure approval; keep them off by default. These thresholds reduce small-cell disclosure; they do not guarantee anonymity.

For sexual compatibility, default to **not shared**, even if answered. Permit only a broad category band after both specifically approve that dimension and at least 5 comparable items meet scope requirements. Thus the base 25-question version generally cannot show a sexual band; assess it privately or leave it unassessed, and offer an optional expansion without pressuring either participant. No intimate question labels, sexual answers, private priorities or dealbreaker reasons in the report. A report can remain useful using other dimensions.

Owners see their own coverage and answers. The recipient sees no exact answered/skipped/matched/constraint counts, private per-category sample size or partner progress. Use the same neutral “not enough shared information” presentation for opted-out, private, skipped, inapplicable or sparse categories. Do not infer detailed missingness from layout or specialized errors. Sparse/omitted categories cannot raise an overall headline, and qualitative output must not imply those categories were evaluated. Conversation prompts come from a generic fixed dimension bank, not secret answers. On-screen report text must explain: “This describes the answers you chose to include. It cannot predict chemistry, honesty, safety or relationship outcomes.”

## Independent invitations and lifecycle

Assessment authorization is a new scope. **There is no required `couple_id`, no membership join for access, and no automatic couple creation.** Exactly two independent authenticated adult user IDs bind to an assessment. A link is a short-lived claim capability, not login, account access or result-release approval. Anonymous visitors may preview sample questions locally; server-saved assessment participation requires independent accounts and applicable adult access.

Proposed defaults: invite expires in 48 hours; accepted assessment closes after 14 days; released result access expires after 30 days or earlier withdrawal. A new release cannot extend the original 30-day result deadline without both explicitly renewing a fresh assessment. No perpetual access derived from an accepted invite.

State machine: draft → invited → collecting → awaiting release → released; terminal states declined, withdrawn, expired, deleted. Submission status is internal per participant; counterpart-facing status does not identify who submitted, withheld release or withdrew. Accept uses hashed high-entropy single-use token, own sign-in/adult access, explicit confirmation and atomic second-slot binding; reject self-invites, third-party claims and replay. Forwarding can let the wrong account claim a bearer link, so acceptance identifies the counterpart with a minimal chosen label for confirmation before either submits; inviter can revoke neutrally. No email/account lookup or existing-couple disclosure.

Each participant submits an immutable answer snapshot independently. Neither sees any computed result about the other before both authorize the **same** manifest, submission revisions, algorithm version, disclosure mask and deadline. Previewing release shows only the report structure and user's own choices. No one-sided “your compatibility if they finish” teaser. Release mask is the intersection of explicit permissions; no accept-all defaults or disclosure inferred from a purchase.

Any edit to answers, acceptance, weight, hard rules, depth, topic scope or disclosure invalidates approvals/results via an assessment-specific `result_epoch`. Both must submit/approve again. Each shared read checks current participant state, epoch, approved revisions, release grant and deadline on D1 primary; final release is conditional/atomic against withdrawal. Membership in a couple is irrelevant, even if these users later pair. Either can withdraw/expire/delete without paying or getting permission. Revoke server result access immediately and purge assessment responses/derived results within 24 hours of termination; existing screenshots or responses in flight cannot be recalled.

If either deletes their account, terminate the assessment and purge both assessment snapshots/derived reports while preserving the other person's independently owned general template, if any. Minimal abuse/deletion tombstones outlive private records only through the documented 30-day anti-probing/recovery window, then purge unless a justified incident hold applies. Backup-aging and quarantined-restore rules in [Privacy](PRIVACY.md) apply. No auto-renewing profile comparison, presence indicator, read receipt or right to inspect the counterpart's account. Blocking and invitation suppression are available without revealing the reason.

```mermaid
sequenceDiagram
  participant A as Adult A
  participant W as Worker: Chemistry Check
  participant D as D1
  participant B as Adult B
  A->>W: Create assessment + fixed depth/disclosure proposal
  W->>D: Assessment scope + participant A + hashed expiring invitation
  W-->>A: Neutral invitation link
  A-->>B: User-controlled link sharing
  B->>W: Independent sign-in, adult access, accept assessment only
  W->>D: Atomically consume link + bind participant B
  Note over W,D: No couple or membership write
  A->>W: Submit own versioned encrypted snapshot
  B->>W: Submit own versioned encrypted snapshot
  A->>W: Approve exact result scope/revision/deadline
  B->>W: Approve same result scope/revision/deadline
  W->>D: Primary-state check + conditional release at result epoch
  W-->>A: Approved category summary
  W-->>B: Same approved summary
  A->>W: Withdraw
  W->>D: Advance epoch, revoke grants, queue bounded purge
  B->>W: Open old report
  W-->>B: Generic unavailable; no private reason
```

## Reuse and inference safeguards

An individual may explicitly save selected **general** responses as a versioned owner-only template. Saving and reusing are separate opt-ins. Before each reuse show which fields will be copied, content/version changes, included acceptance/importance/dealbreakers and disclosure settings; confirm the recipient/assessment and permit edits. Do not carry release permissions across assessments. Copy to an immutable assessment snapshot with provenance; never read a live mutable template during comparison. Intimate answers are excluded from general-template reuse initially; any future sensitive reuse needs separately reviewed explicit consent.

Reuse authorization can be revoked for future imports. Editing/deleting a general template does not silently overwrite past submissions: offer a clear delete-template-and-dependent-assessments action, and an explicit template-only deletion choice explaining that existing assessment copies remain until withdrawal/expiry. Account deletion purges owned templates and terminates dependent assessments. Proposed template TTL 90 days with explicit renewal; schema/version changes invalidate reuse unless the owner reconfirms. No bulk comparison of someone's reusable profile against other users.

Use one active assessment per unordered user pair/question-bank family across 25/50/100 and intimate extensions. Results are fixed snapshots; no arbitrary per-question/category/weight what-if API. Proposed 30-day pair/family re-release cooldown prevents repeated changed-input comparisons; lowering privacy or withdrawing is always immediate. A tier upgrade/expansion is a new mutual revision, never a side-by-side delta report, and cannot bypass that release budget. Allow own drafts/edits during cooldown, but disclose when the next shared release is possible before purchase. Initial anti-abuse hypotheses: at most 5 invite creations/day and 3 active invitations/account, backed by server state and risk controls; no limits on blocking, refusal, deletion or withdrawal.

Do not expose other submissions/release timestamps, exact overlap counts, directional alignment, near-match hints, hard-rule counts or per-answer rejection reasons. Fix deck ordering independent of the partner, pad private envelopes, use bounded fixed-shape scoring and generic unavailability. Coarse summaries can still leak interests, especially if a malicious participant knows their own answers or creates many identities. Rate limits, minimum cell sizes and cooldowns reduce additional probing but cannot eliminate inference or coercion. Explain this before summary authorization, including the global hard-conflict signal's inherent disclosure. Do not promise that “private answers” makes all aggregates non-sensitive.

## Technical reuse and boundaries

Keep one Worker/D1 modular monolith. Reuse authentication/adult-access adapters, invitation token utilities, schema validation, question publication/version conventions, disclosure grants, envelope storage, audit minimization, deletion scheduling and commerce event boundaries. **The current executable catalog is an activity catalog, not a generic question bank**: extract shared ID/version/publication utilities when implementing, then add a typed question catalog. Do not disguise assessment questions as activities or put answers into `private_preferences`, which requires couple membership.

Proposed internal modules: question catalog, assessment lifecycle/authorization, deterministic compatibility scorer and report-disclosure serializer. The scorer consumes explicitly authorized versioned inputs; serializer restricts every field/derived signal. Activity eligibility imports no compatibility score, assessment flag or reused response. A high alignment score, accepted invite, payment or positive sexual summary never grants YES activity approval or ongoing access. New couple/Secret Menu setup starts independently.

Future REST namespace `/api/v1/chemistry-check/`: own assessment create/view, invitation accept, own draft/submit, own release approval, approved report, withdraw/delete, own general templates/import consent. No endpoint takes arbitrary other-user IDs for comparison, exposes submissions to a counterpart, or lists counterpart history. Access checks bind current user to this assessment plus release scope, never generic couple membership. No endpoints or OpenAPI changes are implemented now.

See [Data model](DATA_MODEL.md) for planned tables, [Monetization](MONETIZATION.md) for research/experiments and [Roadmap](ROADMAP.md) for launch gates.

## Release recommendation and acceptance gates

**Launch after the first playable Kink Wheel, as a separate standalone pilot alongside early recipe work, without waiting for couple membership features.** The wheel validates distinctive low-friction entertainment with much less identity/disclosure complexity. Chemistry Check may reach adults earlier in dating and offers an assessable one-time product, but requires two-person completion, invitation abuse controls, auth, privacy/crypto/deletion operations and careful claims. It should not delay the first compelling game or be mislabeled a simple quiz to shortcut those dependencies.

Run non-sensitive concept/UX tests alongside M2; real independent submissions follow M1b and an assessment-specific privacy gate. Pilot the 25-question free core first; introduce reviewed 50/100 depths only after completion/disclosure comprehension is understood. Pricing remains a hypothesis and paid launch separately requires confirmed processor suitability. Treat lower funnel friction and revenue as things to test, not reasons to sell private dealbreakers or unsafe predictive claims.

Before implementation acceptance, specify/test: different answers with mutual acceptance; identical answers without acceptance; one-sided acceptance; zero weights; skipped/unset acceptance; hard conflict alongside high alignment; unresolved hard checks; complete omission of private-only items from all shared outputs/branches; sparse sexual categories; blocked/replayed/forwarded invitations; users with no couple records; release/edit/withdrawal races; reused-template revision/deletion; depth-based probing; price/refund scope; expiration and restored-backup revocation. Content review covers accessibility, inclusive wording and whether eight dimensions merit their labels. Psychometric/predictive claims need appropriately designed independent research, evidence and legal review; usability tests or competitor claims do not supply that validation.
