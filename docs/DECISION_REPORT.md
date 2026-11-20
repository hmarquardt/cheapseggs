# Foundation decision report

**Recommendation:** build a recognizable, guest-first adult entertainment product around the Wheel of Misfortune, then coherent date-night recipes, then private partner matching after security review. The foundation and public-only launch are implemented; actual deployment evidence is recorded in [Launch report](LAUNCH_REPORT.md). Private product features remain deliberately deferred.

**2026-11-20 addition:** [Chemistry Check](CHEMISTRY_CHECK.md) is a planned standalone pre-date compatibility module with 25/50/100 questions, acceptance-aware alignment, separate hard constraints and private category summaries. Its invitations and result-release grants work between independent users without creating a couple or account access. Recommend launch **after the first playable Wheel**, once auth and assessment-specific privacy/deletion gates pass; it can be tested without waiting for couple membership. Free 25-question entry and optional one-time deeper assessments are commercial hypotheses supported by [comparable-model research](MONETIZATION.md#chemistry-check-standalone-acquisition-and-assessment-product), not predictive-validity or revenue claims. No assessment code/migrations/private routes are implemented; `/chemistry/` explains the planned feature.

| Topic      | Decision / finding                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack      | Preact/Vite interactive screens, static public HTML, Hono Worker JSON REST/OpenAPI, D1; R2 reserved for media; no AI or unnecessary services                                |
| Product    | One shared versioned catalog and eligibility engine; discovery/solo/mutual modes distinct; YES/YES exact-version sharing, revocation and membership separate from purchases |
| Brand      | Retro motel/casino lounge, burgundy/plum, pink and champagne, theatrical wheel, witty adult copy; no explicit public artwork or boundary jokes                              |
| Auth       | Recommend maintained Better Auth database sessions + email link/recovery + optional passkeys; adapter/schema proof comes next, auth currently fails closed                  |
| Commercial | Free usable core; first test $4.99 curated collection vs $9.99 bundle, not a static-library subscription; purchaser owns and active partner borrows                         |
| Payments   | Mainstream restrictions make suitability uncertain/likely poor; CCBill/Segpay shortlist for written underwriting, Verotel secondary; none selected or integrated            |
| Security   | Biggest risks are partner inference, account/inbox compromise, stale shared results, privileged runtime access and backup resurrection; no E2EE claim                       |
| Costs      | Local $0; modeled service/email cost $5/$25/$85.19 monthly at 1k/10k/100k MAU, excluding age checks, payments, support/content and other business costs                     |
| Validation | Lint/types/build/Worker dry run; 42 unit/API/release tests, fresh SQLite/local D1 checks; 8 browser tests including metadata and analytics boundaries                       |
| Next       | M2 bounded guest Discovery Mode wheel, with M1b auth/adult-access proof before collecting private partner data                                                              |

## Files and artifacts

[README](../README.md) indexes all requested documents, extra API/privacy/validation specifications and six ADRs. Source foundation is under `src/`; initial schema/fixtures under `migrations/` and `seeds/`; landing/lounge/privacy shell and public assets at repository root/client paths; strict tooling and pinned dependency lockfile; unit/browser checks and GitHub validation/release workflow. GitHub main is canonical; see the launch report for current release identity and external integration limits.

## Outstanding decisions and deferrals

Merchant entity/markets, actual catalog classification and age-assurance cost, email transport, exact supported auth configuration, crypto/key review, final retention/legal notices, reviewed adult catalog, private-data operations and processor terms remain unresolved. Live auth, games/recipes, private matching, R2 provisioning, automatic deletion and billing are not implemented. Public opt-in CFLab analytics is implemented; its real ingestion status is recorded separately. See [Roadmap](ROADMAP.md) for acceptance criteria and dependencies; [Payments](PAYMENTS.md) for primary policy evidence; [Costs](COSTS.md) for formulas and sensitivity; [Validation](VALIDATION.md) for actual evidence and limits.
