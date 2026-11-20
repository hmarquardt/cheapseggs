# ADR 0003 — Portable entitlements and one-purchaser sharing

Status: model accepted; pricing experiment provisional; payment processor unselected.

Decision: offer a useful free core and initially test one-time collections/bundles. Own grants belong to an individual purchaser or eventual gift recipient. Their current active partner can borrow eligible content; a dissolved relationship grants no continued borrowed access. Private matching is always separate. Refunds/chargebacks affect only the source grants, not unrelated purchases.

Products/versioned pack manifests/offers/prices/purchases/subscriptions/grants/refunds/events exist as schema boundaries. Provider adapters later map authenticated events to internal state transitions. Hosted checkout keeps cards outside the application. No provider SDK or live billing in the foundation.

Alternatives: relationship-owned access creates awkward separation/re-pairing disputes; forcing both partners to buy is poor value; a static-library subscription lacks proven recurring value. Micro-packs can be unprofitable under high-risk fixed fees. Mainstream processor eligibility cannot be inferred from another app or a tasteful landing page.

Consequences: entitlement lookup must resolve a current partner server-side and avoid exposing partner receipts. Library ownership is not blanket consent. Written underwriting, tax/age-market review and viable reserve economics precede selection/integration. See [Payments](../PAYMENTS.md), [Monetization](../MONETIZATION.md) and [Costs](../COSTS.md).
