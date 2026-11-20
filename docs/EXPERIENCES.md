# Experiences — M3B (2026-11-20)

Status: **implemented** and released in this milestone (see [Launch report](LAUNCH_REPORT.md)). This
document covers the Date Night Machine, the Romance Cookbook, the extra wheel modes, the content-tier
split and the safety rules that bind all of them. It does not restate [Wheel](WHEEL.md) or
[Security](SECURITY.md); it references them.

## What is live

| Experience          | Route                                     | State                                   |
| ------------------- | ----------------------------------------- | --------------------------------------- |
| Wheel of Misfortune | `/play/`, `GET /api/v1/wheels/misfortune` | live, unchanged semantics               |
| Wheel of Foreplay   | `/play/` (mode tab)                       | live, narrower non-explicit segment set |
| Double Trouble      | `/play/` (mode tab)                       | live, compatible pair within one budget |
| Dealer's Choice     | `/play/` (mode tab)                       | live, house picks the category          |
| Date Night Machine  | `/date-night/`, `GET /api/v1/date-night`  | live                                    |
| Romance Cookbook    | `/recipes/`, `GET /api/v1/recipes`        | live, 12 recipes                        |

No authentication is required for any of these. They are public, non-explicit discovery content at
`access_tier = 'public_preview'`. Partner matching, Chemistry Check, purchases and verified-adult
content are **not** live.

## Content tiers

The catalog now has three states in one typed editorial source:

1. **Published public preview** — 109 activity versions, heat 0–2, non-graphic. Listed in the frozen
   manifest `src/content/discovery/public-access.ts`, compiled with
   `access_tier = 'public_preview'`. This is the only content any public route can return.
2. **Unreviewed drafts** — 6 heat-3 drafts from M2 plus 11 restricted adult drafts (power exchange,
   sensory, roleplay, aftercare) in `src/content/restricted/catalog.ts`. They are `status = 'draft'`,
   heat 3, `access_tier = 'restricted'`, on no wheel, in no public manifest, and never in a response.
3. **Future tiers** — `registered_adult` and `verified_adult` exist in the schema and in
   `contentAllowed`; no row uses them because no market, age provider or content review is approved.

The build fails if a published entry is missing from the manifest, if a manifest entry is
unpublished, if a draft appears on a wheel, if a published entry exceeds heat 2, if public copy
contains the editorial lint terms, or if a restricted draft is not `draft`/heat 3. The database
enforces the same split through `access_tier`, the `public_preview` CHECK and segment joins.

**Habanero stays locked.** There is no published heat-3 material, so `heat = "habanero"` serves the
same pool as `spicy`. That is honest, not complete; enabling it requires the gates in
[Age assurance](AGE_ASSURANCE.md).

## Date Night Machine

### Inputs (`eveningConfigSchema`)

`mood` (romantic / playful / adventurous), `heat` ceiling, `experimentation`, `energy`, `duration`
(10 / 30 / 60 / 240 minutes), `environment`, `supplies` on hand, category `optIns`,
`excludedCategories` and `excludedActivities`. All are bounded; unknown categories or supplies are
rejected with 422 rather than ignored.

### Composition

A recipe template is eligible only when its mood matches, the chosen heat and experimentation sit
inside its bands, the time budget is one of its reachable budgets, its setting matches, and every
category opt-in it needs is already on. Ingredients are a _preference_: a template that needs a
speaker can still be chosen, and the plan lists what to fetch. That is deliberate — ingredients are
not a consent boundary, while supplies still filter individual activities.

`composePlan` walks the template's slots in order (preparation → atmosphere → warm-up → main →
optional surprise → finale), drawing from the server-computed eligible pool. It reserves the minimum
time each later required slot needs, so a greedy long step cannot starve the finale. Every step must
pass the same ceilings, exclusions, environment, supplies and opt-in checks as a wheel spin.
Preparation time is counted once. If a required slot has no eligible idea, the plan **fails**; no
limit is relaxed and no placeholder is invented.

### Replacement, re-rolling and re-timing

The browser holds the plan; the server stores nothing. Each mutation sends the current steps back and
the server re-validates every one against the current catalog and submitted rules:

- `POST /api/v1/date-night/steps` with no choice → reroll that slot (same phase, same budget,
  avoiding the current answer).
- with `chosenActivityId` → replace with that idea **only if** it is in the server's candidate list;
  otherwise `ineligible_choice` (422).
- `POST /api/v1/date-night/plans` with `keep[]` → rebuild around kept steps for a new time budget;
  impossible keeps return `keep-ineligible` instead of dropping a step silently.
- `avoid[]` → "restart with fresh ideas" without forgetting the evening's exclusions.

Recipe requirements are checked again on every mutation; re-timing may bypass only the recommended time band. Free reads also exclude commercially gated recipes and activity references.

A tampered step (an id that is not in the eligible pool, or the wrong phase for its slot) is rejected
as `invalid_plan`. The client cannot widen heat, add a category or bypass an exclusion.

### Interface

One configuration panel (mood, heat, experimentation, energy, time, setting, supplies, opt-ins, hard
no) and one plan view. Every step has reroll, "not tonight", and a substitution picker; the plan has a
time-budget select that re-times around kept steps, restart, change-rules and stop controls. Focus
moves to the plan heading when it appears; status changes are announced through a polite live region.
Nothing is stored in cookies or browser storage.

## Romance Cookbook

Twelve versioned recipes in `src/content/recipes/cookbook.ts`, seeded into the foundation's
`recipe_templates` / `recipe_steps` tables (extended by migration `0005`):

The Slow Cooker, Five-Alarm Chili, Breakfast in Bed, Leftovers Can Be Delicious, The Full Meal Deal,
The Midnight Snack, The Hotel Tasting Menu, The Ten-Minute Tapas, The Potluck Surprise, Sunday Brunch,
No Reservations, Dessert First and The Chef's Table.

Each has an introduction, ingredients, preparation, a sequenced method with guidance, substitutions,
duration and reachable budgets, heat/experimentation bands, required opt-ins, a home for optional
steps and a closing. The cookbook detail view shows the primary activity and its substitutions. "Cook
this tonight" hands the recipe id to `/date-night/?recipe=…`, where it is used only if it genuinely
fits the visitor's rules.

The read path resolves every activity reference against the same public activity set as the wheel and
drops a recipe if any reference is unpublished, non-public or malformed. There is no separate
cookbook store and no client-side catalog of restricted material.

## Wheel modes

`wheels` gained `tagline`, `description`, `draw_mode` and `shortlist_size`. Four published wheels are
seeded; `GET /api/v1/wheels` lists them without content, and `GET /api/v1/wheels/:wheel` returns one
configuration.

- **single** (Misfortune, Foreplay): one winner plus a readable shortlist, as in M2.
- **pair** (Double Trouble): a winner and a compatible partner whose combined duration fits the same
  budget, respecting `incompatibleWith`. The pair is persisted (`companion_activity_id`,
  `companion_activity_version`) so an idempotent replay returns the same two ideas. If no compatible
  pair fits, the mode reports empty rather than pretending it is a single-idea wheel.
- **category** (Dealer's Choice): the server picks a category that already exists in the eligible
  pool, then draws inside it. The chosen category is shown next to the result; it is never an
  approval and never widens the pool.

## Consent, privacy and boundaries

Every experience returns a machine-readable marker (`discovery-prompt-not-consent` or
`date-night-plan-not-consent`) and visible copy saying that an idea is never permission. Passing,
skipping and stopping are always complete answers. Heat is never consent and never an access tier.
No analytics are emitted from `/play/`, `/date-night/` or `/recipes/`; guest state is in-memory only
and the plan itself is never persisted.

## Known limitations

- Catalog copy is editorial, not professionally reviewed. Heat 3 is unpublished.
- The generator's preparation estimate is editorial; it is counted once and can be wrong.
- Plans are not saved, shared or resumable across tabs by design in this milestone.
- Exclusions and opt-ins are per-tab; switching devices does not carry them.
- The restricted adult drafts are scaffolds for review, not approved content.
- No partner approval, matching or entitlement check is involved, because those features are not live.
- "Dealer's Choice" is a category-first draw, not a hand of cards with a stored hand.

The bounded independent review and corrections are recorded in [M3B Security Review](M3B_SECURITY_REVIEW.md), including migration `0006`, replay policy, resource limits and residual risks.
