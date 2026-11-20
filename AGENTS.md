# Working on CheapSeggs

Read README.md and the relevant docs before changes. This is an adults-only entertainment product. Keep humor in packaging; never make boundaries, refusal, identity, or accessibility the joke.

- This assignment authorizes local scaffolding only. Production deployment, billable infrastructure, live payment integration, and implementing the whole application require further user approval. Do not add credentials or enable paid services.
- Default platform: one Cloudflare Worker + static assets + D1; R2 only for media when needed. Maintain a modular monolith. No AI dependency in the MVP.
- Each person is an independent identity. Relationship membership, authentication, consent eligibility, and commercial entitlement are separate checks. A MAYBE is never automatic eligibility; heat and purchases cannot override boundaries.
- Only YES/YES at the exact current content version enters a mutual pool. Recheck active membership, sharing, consent epoch, publication revision, and entitlements on every shared read/use. No stale authorization caches or client-authoritative results.
- Chemistry Check is a planned exception to couple-based scope: two independent users participate in an expiring assessment without couple membership. Check assessment participation/release/epoch/expiry, never create a couple on assessment acceptance, and never use compatibility results as activity consent. Private-only responses/dealbreakers must not affect any partner-visible derived output. See docs/CHEMISTRY_CHECK.md (added 2026-11-20).
- Never log private answers, activity IDs from private play, invite/auth tokens, intimate histories, full payment payloads, or request bodies. No analytics dimensions for preferences, heat, categories, relationship IDs, or intimate result IDs.
- No custom authentication/cryptography. Integrate reviewed frameworks later. Never describe the product as end-to-end encrypted unless that is implemented and verified.
- Never put private/premium assets under public/. Treat D1 as truth for identity, relationships, and entitlements. Do not expose internal D1 REST access to clients.
- Use TypeScript strict mode, bounded inputs, prepared SQL, append-only migrations and versioned catalog content. Generate authentication schemas from the selected pinned framework configuration; do not improvise session tables.
- Use `npm run check` and the relevant local D1/browser checks. Do not deploy to test. Tests should exercise boundary behavior, authorization, revocation, and billing idempotency when implemented.
- Update docs when changing architecture. Label hypotheses, production gates, and unsupported functionality honestly. Research date: 2026-11-19; recheck vendor policies and prices before spending or launch.
- No scheduled CI. No public content or search metadata that implies a feature is live before it works.
