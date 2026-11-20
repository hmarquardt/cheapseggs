# Product strategy

Status: proposed product, foundation implemented. Research checked 2026-11-19. Numerical targets below are validation hypotheses, not observed behavior.

**2026-11-20 public launch scope:** the user authorized deployment of the safe public foundation, and M2 later released the first playable guest Discovery wheel. Implemented public pages explain the live Wheel plus the planned Date Night Machine, Chemistry Check, Secret Menu and Cookbook, with about/privacy/preview terms, complete social metadata and a non-explicit lounge. The wheel serves a reviewed-editorial, non-graphic 44-entry catalog and states continuously that a spin is a prompt, never approval. No registration, real assessment/invitation, stored private answer, generated recipe or checkout is enabled. Optional public-page analytics covers public pages only; `/play/` emits nothing, so spins and boundaries are never measured. [Launch report](LAUNCH_REPORT.md) separates implemented, deployed and independently verified results.

## Promise and initial audience

CheapSeggs helps consenting adults discover what turns them both on, have fun exploring possibilities, and make memorable evenings together. It is entertainment and chemistry: an invitation to play, with no relationship score, performance goal, or clinical curriculum.

Start with established adult partners who want novelty without homework or a large purchase. The core job is “help us find something we both actually fancy tonight.” Mobile web avoids two app installations. A free guest wheel provides immediate entertainment; private matching earns an account invitation later. Use neutral partner labels, optional pronouns, adjustable mobility/energy, non-alcohol alternatives, and role-specific preferences where relevant. Do not infer anatomy, roles, or interests from gender/orientation.

The wedge is **a memorable wheel plus coherent recipes and unusually honest privacy**. Matching alone is already served by [We Should Try It](https://www.weshouldtryit.com/), which offers a browser questionnaire without required registration. [Spicer](https://spicer.app/) combines questions, packs, and partner sharing. CheapSeggs should win on theatrical experience, no completion pressure, useful before signup, explicit YES/YES rules, and trustworthy revocation. These are differentiation hypotheses, not proven advantages.

## Experience contracts

### Date Night Machine

Heat Mild/Medium/Spicy/Habanero maps to 0–3; experimentation Classic/Curious/Adventurous to 0–2. Mood (romantic/playful/adventurous), energy 0–2, duration (quickie/30/60/all evening), environment (home/hotel/getaway/other private setting), supplies, preparation time, accessibility needs, exclusions, and category opt-ins are distinct inputs. Heat is an upper bound, not a permission bundle. Quickie initially means a configurable 10-minute planning budget; all evening caps at 240 minutes with breaks.

Output: setup → warm-up → compatible main activities → optional alternatives → finale/reconnection. A curated template selects eligible steps within a total time budget, accounts for preparation and supplies once, checks pairwise incompatibilities and role compatibility, and uses mood tags for ranking only. Every substitution runs through the same filters. If no coherent plan fits, offer fewer steps or a user-approved time change; never silently raise intensity or relax a boundary. Present a recipe card with ingredients, prep, optional steps, estimated time, and a visible “change/stop” action. No AI required.

### The Wheel of Misfortune

Tagline: **Spin responsibly. Misbehave consensually.** The flagship starts with one curated wheel, then supports multiple themes using the same schema:

| Wheel               | Distinct purpose                                                | Release                         |
| ------------------- | --------------------------------------------------------------- | ------------------------------- |
| Wheel of Misfortune | General discovery topics                                        | M2                              |
| Wheel of Foreplay   | Anticipation and sensual conversation                           | M2 expansion after review       |
| Double Trouble      | Eligible activity + compatible, independently opted-in modifier | Later                           |
| Habanero Roulette   | Higher intensity, specific category opt-ins mandatory           | After specialist content review |
| Dealer’s Choice     | Random selection within a released mutual pool                  | M4                              |
| Mystery Wheel       | Hide the presentation until reveal, never hide boundaries       | Later                           |

Discovery is a discussion prompt, solo is private curiosity, and Mutual Mischief is restricted to a deliberately shared YES/YES pool. UI must always display the mode. The server chooses a result from eligible versioned records before animation. Uniform and positive-integer weighted policies are supported; changing animation duration never changes selection. Avoid repeats within the current session; an exhausted pool asks the user to clear history. There are no bets, money stakes, prizes, coerced tasks, streak penalties, or countdowns to perform an intimate act.

The result screen offers “talk about it,” optional save, and add-to-recipe after the relevant milestones. A fresh in-person check is always required. Lower intensity, stop, or exit must be as easy as continuing.

### Secret Menu

Private YES / MAYBE–discuss / NO / Hard NO. Only exact-version YES/YES enters the activity pool. A separate explicit opt-in applies to sensitive categories and role direction. MAYBE never becomes automatic eligibility or a secretly shared “almost match.” Hard NO suppresses the activity without exposing who declined or whether the response was hard NO, NO, unanswered, or unavailable.

Both users independently authorize a fixed catalog round and explicitly authorize release of its positive matches. No partner response/progress/count endpoint. New activities/content revisions require a new round. [Privacy](PRIVACY.md) specifies the protocol and unavoidable inference limits. Invitations never reveal existing preferences; new relationships start blank. Revocations invalidate future use immediately.

### Romance Cookbook

Curated, versioned templates include theme, name, description, difficulty, heat, experimentation, time, supplies, prep, activities, substitutions, boundaries, compatibility, and accessibility. Templates reference catalog versions, not copied content. Standalone browsing provides useful free examples. Generation adapts the same catalog to time, mood, and eligible pool; paid packs are content associations, not a separate engine.

## Scope and launch sequence

### Planned addition: Chemistry Check (2026-11-20)

[Chemistry Check](CHEMISTRY_CHECK.md) is an optional pre-date compatibility experience for two independently authenticated adults who already have romantic interest, **without requiring a couple relationship**. Offer 25, 50 or 100 questions covering relationship goals, lifestyle, communication, values, affection, sexual compatibility, adventure and humor/personality; intimate expansions require explicit opt-in. Capture own answers, acceptable partner answers, importance, hard dealbreakers, disclosure choices and skipped/unanswered states. Different answers can be compatible when mutually accepted; hard incompatibilities remain separate from weighted alignment.

Assessment invitations, independent submissions and mutual result release are assessment-scoped and expire. Acceptance never creates a couple, reveals private answers or permits ongoing account access. Broad category summaries are optional; individual sexual answers and private dealbreakers are not shared. Reusable general answers require separate per-assessment consent, immutable versions and anti-probing controls. Compatibility is not consent, a prediction, or a psychometric claim.

Recommend a standalone Chemistry Check pilot **after M2's first playable Wheel**, following authentication and assessment-specific privacy review, potentially alongside early recipe work. It need not wait for M4 couple membership. Non-sensitive concept testing can happen alongside M2. See the module specification and [commercial analysis](MONETIZATION.md#chemistry-check-standalone-acquisition-and-assessment-product) for scope and evidence. No module implementation is added to the initial scaffold.

M1 foundation → M1b authentication/age-policy proof alongside M2 guest discovery wheel → M3 curated recipes → M4 secure couples pilot → M5 commercial packs after processor approval → M6 informed expansion. The guest wheel can be tested locally with consenting adult testers before full accounts. No public adult-content launch before market review.

A compelling initial public candidate has 40–60 professionally reviewed topics, one polished wheel, a free usable session, 6–10 recipe templates, readable safety/context metadata, accessible motion-free results, and no chat, photos, UGC, AI, social feeds, or sexual activity tracking. Counts are editorial budget estimates.

Seven-day challenges, game shows, Golden Tickets (surprises without value-bearing prizes), favorites, collections, guest themes, seasonal/hotel editions, printables, gifts, “Relationship Leftovers,” anniversaries and AI presentation are expansion candidates. Model them as templates/packs and saved experiences. Do not implement them in the foundation.

## Validation and stop conditions

Recruit 15–20 adult pairs across identities, abilities and age bands for opt-in moderated tests without collecting intimate answers. Validate whether they understand modes and MAYBE, can refuse comfortably, and can start without installing/signing up. Gate M2 expansion on at least 90% correct mode/consent comprehension in testing, no critical accessibility issues, and a median first-result time under 60 seconds (hypotheses).

For a 200–500-person invited pilot, target 60% of game entrants reaching a result and 20% voluntarily returning within 14 days. For monetization, seek 30 real purchases and 10 follow-up interviews after underwriting. Do not treat tiny cohorts as statistical proof. If users feel pressure, infer refusals easily, misunderstand privacy, or do not return, revise product rules before adding packs. Never use actual intimate preferences to optimize retention or targeting.
