# ADR 0004 — Minimize intimate records and make limits explicit

Status: accepted design; encryption/lifecycle/analytics implementation deferred.

Decision: application-owned encryption envelopes for private responses/generated plans, no E2EE or perfect-anonymity claims, no routine intimate admin UI or support impersonation, no private answers/activity histories for marketing. Prefer transient guest use, explicit sharing, bounded default retention and deletion with backup-aging disclosure.

Positive match sharing inherently discloses some interest. Fixed decks, release controls, no partner counts/progress or arbitrary probes mitigate incremental inference; they cannot prevent a coercive partner or erase displayed results. Avoid false privacy claims.

Production gates: actual market/content/age-assurance review before public adult access; maintained auth integration/recovery before accounts; independent privacy/crypto/authorization/deletion/restore review before private matching; written processor suitability and tested fulfillment/refunds before commerce. No billable resources or deployments authorized by the current assignment.

Consequences: slower launch of the most sensitive feature, lower operational/legal exposure, more credible customer communication. A global application key does not provide per-user cryptographic erasure. External KMS or genuine client-held cryptography requires a new architecture decision and cost/UX analysis. See [Privacy](../PRIVACY.md) and [Security](../SECURITY.md).
