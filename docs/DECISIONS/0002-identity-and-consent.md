# ADR 0002 — Identity, membership, sharing and consent are separate

Status: accepted principles; Better Auth integration provisional until M1b workerd proof.

Decision: each adult has an independent identity and revocable database session. Relationships are explicit two-member records, not identity/account merges. Better Auth with database sessions, email-link onboarding/recovery and optional passkeys is the primary recommendation; schema is generated from the selected supported configuration later. IdentityService remains disabled now.

Private preference rounds are relationship-scoped and fixed-deck. Only two exact-version YES responses plus required category/role opt-ins qualify after both authorize positive disclosure. MAYBE never automatically qualifies. Internal consent epoch, publication revision and current entitlement/membership checks invalidate stale results. Server selection is independent of animation.

Alternatives rejected: shared couple login, permanent-pair user columns, MAYBE-as-match, client-calculated eligible lists, long-lived cached authorization or raw preference APIs. They weaken independent revocation and increase disclosure.

Consequences: returning users have slightly more explicit sharing/release steps. Positive matches reveal positive interests; negative inferences cannot be perfectly eliminated. Batching/no-count/no-probe rules mitigate extra leakage. A spin remains a prompt, not consent to perform anything. See [Auth](../AUTH.md), [Privacy](../PRIVACY.md) and [Security](../SECURITY.md).
