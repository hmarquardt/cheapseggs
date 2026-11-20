# Brand, art direction, and UX system

## Creative direction

**The Velvet Vacancy**: a retro motel lounge with a tiny game-show stage. Deep burgundy surfaces, pink neon accents, amber bulbs, champagne borders and cream display type. The joke is the sign outside; the experience inside should feel considered and generous. Use a single strong wheel silhouette as the recognizable marketing asset.

Primary line: **Cheap Seggs. Priceless Memories.** Supporting lines: “Your Bedroom. Our Terrible Ideas.” and “Tonight’s Special: Whatever You Both Want.” Avoid “Bad Decisions” as primary copy: it can undermine thoughtful consent. Never joke about a hard NO, pressure, intoxication, age, or identity. Prefer “Fancy discussing this?” over “You have to…” and “Maybe means discuss” over euphemisms that dilute the rule.

## Tokens implemented in src/client/tokens.css

| Token    | Value   | Role                                       |
| -------- | ------- | ------------------------------------------ |
| ink      | #240d19 | Main canvas, dark text on pale buttons     |
| surface  | #3c152a | Raised velvet panels                       |
| burgundy | #641932 | Atmospheric secondary surface              |
| crimson  | #bd2850 | Illustration/large accents, not small text |
| pink     | #ff8ead | Headline accents, primary buttons          |
| plum     | #552243 | Supporting surfaces                        |
| amber    | #ffc16d | Focus outlines, selected states            |
| gold     | #e9bc7b | Labels, rules, wheel trim                  |
| cream    | #fff2dc | Main text                                  |
| muted    | #d7bfc8 | Body/supporting text                       |

Body is system Avenir/Segoe UI; editorial display is local Iowan/Palatino/Georgia. No font tracking or CDN dependency. Later commission/license a distinctive display face, self-host WOFF2 and budget under 60 KB. Minimum regular text 16px, labels 14px, decorative metadata 12px only. Display sizes use clamp, not fixed desktop assumptions. Spacing scale 4/8/12/16/24/32/48/64px. Standard radius 12px; pill buttons; recipe cards may use clipped ticket corners without clipping focus.

Contrast target WCAG AA: 4.5:1 body text, 3:1 large text/meaningful controls. Verify actual pairs in browser, including disabled/selected/error states. Use text/icons in addition to color. Pink/cream on ink and ink on pink are core pairs; crimson is decorative. Focus is a 3px amber outline with 5px offset. Touch targets at least 44px, preferably 48–54px.

## Reusable component specification

| Component              | Behavior and states                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| Wordmark / HouseHeader | Original text mark, compact mobile header, clear home link                                                 |
| MarqueeWheel           | Wheel stage, high-contrast pointer, segment labels mirrored in a readable list; display-only in foundation |
| ActionButton           | Primary/outline/danger, idle/loading/disabled/error; never use a disabled button without context           |
| ModeSelector           | Explicit selected mode using aria-pressed; full description next to controls                               |
| HeatControl            | Text labels for four levels; category opt-ins separately, no implied blanket consent                       |
| PreferenceCard         | Four named responses, private state, accessible skip; no default YES; no partner-progress hints            |
| RecipeCard / Step      | Theme header, supplies, total time, phases, alternatives, boundary notice, stop/change controls            |
| PackTicket             | Clear included content, fixed price/duration, purchaser sharing rule; ownership/pending/refunded state     |
| PrivacyPanel           | Share status, current devices, leave-relationship and deletion controls; plain language                    |
| ResultDialog           | Move focus to heading, Escape/close, return focus; readable result independent of visual wheel             |
| Notice / EmptyState    | Generic shared ineligibility; never enumerate a partner’s missing approvals                                |

Foundation implements CSS tokens, buttons, wordmark, mode selector, static samples, notice styling and decorative wheel. Other components above are specifications, not implemented claims.

## Screen and flow specification

| Screen              | Core task and progression                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| Landing             | Understand playful adult discovery, see flagship wheel, enter as guest, read privacy                  |
| Guest entry         | Age policy gate applicable to location; mode explanation; no account required for eligible guest play |
| Account entry       | Email link then optional passkey, discreet email preview, explicit multi-device/shared-device choices |
| Game selection      | Wheel first; recipes and cookbook next; no generic admin dashboard                                    |
| Wheel               | Mode, heat, exclusions/supplies, spin, static list alternative, sound toggle; results on server       |
| Private preferences | Small fixed decks, own answers only, four responses, specific category opt-ins                        |
| Partner matching    | Independent invite acceptance, explain positive disclosure, release confirmation, no counts/progress  |
| Recipe              | One coherent card; each activity optional; replacements constrained identically                       |
| Saved experiences   | User’s own collection; shared items revalidated; invalid items hidden with generic notice             |
| Premium discovery   | Browse pack preview from menu/result completion; no mid-experience interruption                       |
| Purchase            | Approved hosted checkout only; explicit total/tax/ownership, pending/fulfilled/retry/refund states    |
| Settings            | Devices, privacy mode, sharing/revocation, leave, delete; fresh auth for destructive account controls |

Do not imply these flows are live in the scaffold. The current lounge demonstrates modes without saving or generating anything. Public preview is intentionally non-explicit; authentic adult positioning is still visible. No fake testimonials or conversion numbers.

## Motion, illustration, and sound

M2 spin: 2–3 seconds deceleration, no flashes, no continuous idle movement, no input lock beyond the request. Server selection precedes animation; cancellation cannot select a new outcome. Prefers-reduced-motion shows a brief fade or instant result and a “show result immediately” control. A tabular list of choices is the accessible alternative; wheel labels are never the only text. Optional short locally generated tick/chime starts muted, requires explicit user gesture and never autoplays. No external audio service.

Use restrained original vector hearts, cherries, cards and flames. No nudity or photorealistic sexual assets needed for first release. Later commissioned artwork must depict adults clearly, have rights/consent records, and avoid school/teen/childlike cues. Any mature private artwork stays behind age/entitlement checks. Public share art: 1200×630 neon sign or wheel, no private result. The foundation’s CSS wheel and cherry favicon avoid third-party asset licensing or generated-image clutter.

## Chemistry Check UX extension (planned 2026-11-20)

Keep the lounge identity with a gentler pre-date invitation: “A little less guessing before the first date.” Offer clearly labeled 25/50/100-question depths, own answer versus acceptable-partner choices, importance and a separately labeled dealbreaker. Skipping and intimate-topic opt-ins are always available. Explain private-only versus permission for an aggregate summary before asking anyone to release results. Use category conversation cards, sparse/unassessed states and neutral differences; no soulmate percentage, red rejection stamp, predicted relationship success, or public compatibility badge.

New planned screens: non-sensitive module explanation/sample, independent assessment invite acceptance, own response editor, optional general-template import confirmation, exact-scope mutual-release confirmation, category summary and withdraw/delete/expiry state. Acceptance copy says explicitly that this creates no couple and shares no answers. No counterpart completion progress, hard-rule teaser, paid reveal after intimate input, or automated relationship upgrade. [Chemistry Check](CHEMISTRY_CHECK.md) specifies the disclosure limits; no frontend component is implemented by this addition.
