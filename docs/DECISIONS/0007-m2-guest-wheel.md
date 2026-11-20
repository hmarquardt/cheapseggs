# ADR 0007 — Guest Discovery wheel: transient state, server-only selection, gated content

Status: accepted and implemented in M2 (2026-11-20).

Context: M2 needs a playable wheel that anyone can use without an account, while the
product's consent, privacy and content gates stay intact. Three questions had no
prior answer: what the wheel may serve, who decides the result, and what a guest
session may remember.

Decision:

1. **Content gate before reach.** Publish only non-graphic heat 0-2 entries. Keep the
   unreviewed heat-3 backlog in the source as `draft`, excluded from wheel segments and
   asserted absent in build, migration and production smoke checks. A larger catalog is
   not worth publishing material the content/market review has not cleared.
2. **Server-only selection, readable wheel.** The browser sends boundaries, never
   candidates. The worker selects the winner with crypto randomness over the full
   eligible pool, then builds a shuffled 8-item shortlist that always contains it. The
   animation reveals a decision that already happened; the shortlist keeps the wheel
   legible without changing the distribution.
3. **Variety is not a boundary.** Repeat avoidance drops recently seen results only when
   the remaining pool is non-empty, and never touches heat, time, supplies, opt-ins or
   exclusions. An empty eligible pool stays empty and is explained.
4. **Guest state is a capability, not a profile.** The browser proposes a 24h nonce, kept
   in memory (no cookie, no storage). D1 stores only the nonce, timestamps, a request
   digest and the selected catalog reference. Boundaries are never persisted, so there is
   no personal preference record to breach, sell or mine; the explicit reset endpoint
   deletes the session and its spins.

Alternatives rejected: client-side random selection (unauditable, biases results);
server-issued session tokens (force a first-request race on double taps); persisting the
full boundary set for replay verification (creates exactly the intimate profile the
product promises not to keep); showing every eligible idea on the wheel (unreadable at
44 slices, or requires deceptive dummy segments).

Consequences: a guest who reloads gets a new session; a withdrawn result invalidates a
replay instead of silently reusing it; the wheel is limited to eight visible wedges and
must always offer the textual list; distributed rate limiting and professional content
review remain open gates rather than being simulated.
