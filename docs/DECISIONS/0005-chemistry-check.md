# ADR 0005 — Independent pre-date assessment scope

Date: 2026-11-20. Status: accepted architecture/product boundaries; launch/pricing/algorithm thresholds provisional; **planning only**.

## Context

Chemistry Check serves two adults with initial romantic interest who may not be a couple or even have met. The foundation's private activity preferences and invitations are couple-scoped. Reusing those tables/authorization predicates would create the wrong relationship and disclosure rights. A compatibility score must not become sexual consent or a substitute for YES/YES activity eligibility.

## Decision

Use a distinct assessment with two independent participant identities, expiring single-use invitation, versioned 25/50/100-question manifests, private immutable submissions, separately authorized summary scope, result epoch, mutual release and bounded access lifetime. Accepting does not create a couple, reveal responses or grant ongoing account rights. A later couple relationship requires an entirely separate invitation; no preferences move automatically.

Capture own response, acceptable-partner predicate, importance, hard rule, disclosure and skipped/unanswered states. Score directional acceptance, not identical-answer agreement; hard incompatibilities are separate tri-state results. Default shared reports show only authorized category-level bands with coverage thresholds, no individual sexual answers or private dealbreaker identities. Private-only inputs cannot affect shared derived outputs, timing/availability branches or prompts. No predictive/psychometric validity claim without appropriate independent evidence.

General-answer reuse is an explicit per-assessment, version-checked snapshot copy, not ongoing access to a profile. No intimate reuse initially. Fixed decks, one active pair/question-family, cross-depth release budgets and no probe/delta endpoints mitigate inference; positive/aggregate disclosure still has limits and must be explained.

Reuse one Worker, D1, authentication/adult-access adapters, versioning/validation conventions, invitation/crypto/deletion utilities and processor-independent fulfillment patterns. Add a typed question catalog when implemented; current executable records model activities, not assessment questions. Plan assessment service credits separately from pack entitlements. One sponsor covers both participants in one assessment without membership or answer-release authority.

## Alternatives and consequences

- Rejected: automatically forming a couple, using a nullable couple membership workaround, or granting broad account access with a link. These confuse participation, consent and identity boundaries.
- Rejected: raw answer/hidden-dealbreaker reveal, sameness-only scoring, a high combined percentage that masks one person's hard constraint, or a paywall for refusal/privacy.
- Provisional: **launch after the first playable Kink Wheel**, once authentication and assessment privacy/deletion controls pass; non-sensitive concept testing can happen alongside Wheel work. Standalone acquisition could reach an earlier stage of dating, but two-person completion/trust and abuse complexity exceed a guest spin. It need not wait for couple membership features.
- Commercial hypothesis: free 25-question core, optional one-time $4.99/$9.99 50/100-depth experiments covering two people after underwriting and pilot evidence; no subscription initially. Existing competitor offers establish business-model precedents, not demand or validity for this product.

This ADR **clarifies the scope** of [0002](0002-identity-and-consent.md) and [0004](0004-privacy-and-launch-gates.md): couple membership/YES-activity predicates still govern shared intimate activities; assessment authorization is separate. It does not supersede their privacy, age-access, independent identity or launch gates. See [module specification](../CHEMISTRY_CHECK.md), [planned schema](../DATA_MODEL.md#planned-chemistry-check-entities-no-migration-yet), [monetization research](../MONETIZATION.md#chemistry-check-standalone-acquisition-and-assessment-product) and [roadmap](../ROADMAP.md).
