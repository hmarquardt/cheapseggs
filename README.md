# CheapSeggs

**Cheap Seggs. Priceless Memories.** Playful discovery for consenting adults, with boundaries built into the product.

This repository contains the researched product architecture and **safe public preview**. GitHub [hmarquardt/cheapseggs](https://github.com/hmarquardt/cheapseggs), branch `main`, is canonical. Live production: **https://cheapseggs.com**. The public preview now includes four playable wheels, a complete **Date Night Machine** and a twelve-recipe **Romance Cookbook** over a 109-entry non-explicit catalog; M3A adds independent email-code accounts, recovery, revocable sessions and account deletion. Cloudflare provides account email delivery. Independent age assurance, restricted content, private answers, assessments, partner matching, recipes and payments remain disabled. [Deployment](docs/DEPLOYMENT.md) records resources, release gates and verification requirements; [launch report](docs/LAUNCH_REPORT.md) records actual deployment status.

Start with the concise [decision report](docs/DECISION_REPORT.md), then use the documentation index below.

## Run locally

Use Node 24 LTS (`nvm use`) and npm. No Cloudflare account, credentials, or paid services are required.

```sh
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://127.0.0.1:8787`. Wrangler persists local SQLite state under ignored `.wrangler/state`. `npm run dev` builds the frontend then serves both assets and the API; restart after UI edits. For UI live reload, run `npm run dev:web` alongside it and use Vite's printed URL. Vite proxies `/api` to port 8787. Security header/browser checks use Wrangler, not Vite.

```sh
npm run check        # lint, types, seed drift, unit/integration tests, fresh SQLite checks, frontend + Worker dry run
npm run seeds:build  # regenerate seeds/*.sql from the editorial catalog
npm run db:seed      # safe to repeat
npm run db:check
npx playwright install chromium
npm run test:e2e     # local Worker, desktop + mobile, accessibility and API smoke checks
```

`npm run build` invokes **`wrangler deploy --dry-run`** to compile only. `wrangler.jsonc` remains local; `wrangler.production.jsonc` is the explicit production target. `npm run deploy` is guarded for validated GitHub Actions `main` releases; it requires the deployment secret and publishes the tagged commit. Do not remove `--dry-run` from a build command to improvise a release. See the deployment runbook for the documented initial bootstrap exception.

## M3A accounts and adult access

`/account/` implements registration/sign-in through Better Auth 1.7.27 email OTP, self-declared adulthood, optional non-explicit category approvals, recovery, session revocation and deletion. No real identity documents or private partner data are collected. [Authentication](docs/AUTH.md) describes the controls; [Adult access](docs/AGE_ASSURANCE.md) records market/provider gates, costs and exact blockers. Heat cannot unlock restricted categories.

## What exists

- Nine substantive public landing, feature-explanation and policy pages, with initial-HTML canonical/Open Graph/X metadata, original social artwork, sitemap and robots.
- `/play/` hosts four working wheels over the same 109-entry versioned non-explicit catalog: Misfortune, Foreplay, Double Trouble (a compatible pair) and Dealer's Choice (the house picks the category). Server-side eligibility, crypto-random selection, a readable list alternative, reduced-motion results, optional muted sound and a 24h guest session that stores no boundaries. The in-memory adults-only acknowledgement is **not** age verification. See [Wheel](docs/WHEEL.md) and [Experiences](docs/EXPERIENCES.md).
- `/date-night/` composes a coherent evening from mood, heat, experimentation, energy, time, setting, supplies, opt-ins and exclusions: preparation, atmosphere, warm-up, mains, optional surprise and finale. Every step can be rerolled, replaced from a server-validated list, hidden or re-timed; nothing is stored and no boundary is relaxed. `/recipes/` browses the same twelve versioned recipes with ingredients, preparation, substitutions and safe hand-off to the machine.
- Hono API: liveness, D1 readiness, release/Worker version identity, three deliberately public non-explicit sample records, the wheel directory and per-wheel configuration, the idempotent `POST /api/v1/spins` guest spin, explicit guest reset, the Date Night config/plan/step routes and the cookbook list/detail routes; reviewed auth/account routes are implemented; payment namespaces return 503 and other unimplemented APIs return 404. Worker-first handling applies security headers, canonical redirects and private noindex/no-store boundaries.
- Zod catalog model, pure eligibility policy, rejection-sampled weighted selection with a readable shortlist, and a processor-independent entitlement service boundary. Eligibility and selection are wired into the Discovery wheel; mutual/shared modes are not built.
- Local D1 migrations: catalog, relationship/privacy scaffolding, encrypted-payload storage boundaries, commerce/entitlement records and the M2 guest wheel tables; idempotent, generated catalog seed.
- Consent-based minimal CFLab adapter with no private paths/answers, no session identifier, no raw URL/referrer/campaign values and DNT/GPC support. Future product-event names exist without fake event emission.
- GitHub Actions validation → guarded deployment → independent production smoke tests. A durable repository credential is required; missing external authorization is documented rather than replaced with a short-lived token. Read [validation evidence](docs/VALIDATION.md) and the launch report for actual results.

## Read the decisions

| Document                                   | Purpose                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [Product](docs/PRODUCT.md)                 | Audience, differentiation, experience rules, MVP                                          |
| [Wheel](docs/WHEEL.md)                     | M2 discovery wheel: catalog gate, selection, guest session, accessibility                 |
| [Experiences](docs/EXPERIENCES.md)         | M3B four wheels, Date Night Machine, cookbook and the public/restricted tier split        |
| [Chemistry Check](docs/CHEMISTRY_CHECK.md) | Planned pre-date assessments, acceptance scoring and independent invitation/privacy scope |
| [Brand](docs/BRAND.md)                     | Art direction, voice, tokens, component/UX specification                                  |
| [Architecture](docs/ARCHITECTURE.md)       | Stack comparison, module boundaries, services, sequences                                  |
| [Authentication](docs/AUTH.md)             | Framework comparison, sign-in, recovery, guest migration                                  |
| [Privacy](docs/PRIVACY.md)                 | Matching protocol, inference limits, deletion and key ownership                           |
| [Security](docs/SECURITY.md)               | Threat model and market/compliance gates                                                  |
| [Data model](docs/DATA_MODEL.md)           | Schema, transactions, migrations, backup/deletion semantics                               |
| [API](docs/API.md)                         | REST proposal and live versus proposed endpoints                                          |
| [Monetization](docs/MONETIZATION.md)       | Competitors, ranked experiments, metrics, couple ownership                                |
| [Payments](docs/PAYMENTS.md)               | Provider evidence, restrictions, underwriting checklist                                   |
| [SEO](docs/SEO.md)                         | Acquisition, content IA, previews, search restrictions                                    |
| [Analytics](docs/ANALYTICS.md)             | Actual CFLab contract, site registration, permission and minimization                     |
| [Deployment](docs/DEPLOYMENT.md)           | Production resources, GitHub release path, rollback and external prerequisites            |
| [Launch report](docs/LAUNCH_REPORT.md)     | Actual SHA/version, live checks and unresolved integration state                          |
| [Costs](docs/COSTS.md)                     | Current price sources, scenarios, unit economics                                          |
| [Roadmap](docs/ROADMAP.md)                 | Dependency-aware milestones and acceptance criteria                                       |
| [Decisions](docs/DECISIONS/README.md)      | Accepted, provisional, and deferred decisions                                             |

## Layout

```text
src/client/       Preact shell, styles, reusable CSS tokens
src/domain/       validated content types, eligibility, randomness
src/services/     identity and entitlement boundaries
src/server/       Worker HTTP adapter; no intimate-data endpoints
migrations/      ordered SQL, domain/commerce foundation
seeds/           three safe fixtures, explicit local/production files
scripts/         fresh-database verification
tests/unit/      consent, entitlement, randomness, API boundaries
tests/browser/   local runtime/UI/accessibility smoke tests
public/          only public assets; CSP and indexing restrictions
docs/            product, commercial research, architecture, ADRs
```

## Before a launch

Read [Roadmap](docs/ROADMAP.md). The account foundation is implemented; it does not open private product features or verified-adult content. The next product work is partner matching and Chemistry Check, which require the private-data release gate; the restricted adult catalog stays unpublished until the age-assurance and content-review gates pass. Private partner data requires the identity/privacy/deletion release gate; purchases require explicit processor suitability and approval. Intended sensitive-feature markets, merchant entity, tax treatment and final private-service legal documents remain decisions. Do not submit merchant applications or contact anyone on the user's behalf without instructions.
