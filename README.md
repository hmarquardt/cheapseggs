# CheapSeggs

**Cheap Seggs. Priceless Memories.** Playful discovery for consenting adults, with boundaries built into the product.

This repository contains the researched product architecture and **safe public preview**. GitHub [hmarquardt/cheapseggs](https://github.com/hmarquardt/cheapseggs), branch `main`, is canonical. Live production: **https://cheapseggs.com**. The public explanations and the first playable **Wheel of Misfortune** (guest Discovery Mode) are implemented; authentication, private answers, assessments, partner matching, recipes, email delivery and payments remain disabled. [Deployment](docs/DEPLOYMENT.md) records resources, release gates and verification requirements; [launch report](docs/LAUNCH_REPORT.md) records actual deployment status.

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

## What exists

- Nine substantive public landing, feature-explanation and policy pages, with initial-HTML canonical/Open Graph/X metadata, original social artwork, sitemap and robots.
- The lounge at `/play/` is a working guest Discovery wheel: 44-entry versioned non-explicit catalog, server-side eligibility and crypto-random selection, an 8-wedge retro-casino wheel with a readable list alternative, reduced-motion/instant results, optional muted sound and a 24h guest session that stores no boundaries. The in-memory adults-only acknowledgement is **not** age verification. See [Wheel](docs/WHEEL.md).
- Hono API: liveness, D1 readiness, release/Worker version identity, three deliberately public non-explicit sample records, the published wheel configuration, the idempotent `POST /api/v1/spins` guest spin and an explicit guest reset; auth/payment namespaces return 503 and other unimplemented APIs return 404. Worker-first handling applies security headers, canonical redirects and private noindex/no-store boundaries.
- Zod catalog model, pure eligibility policy, rejection-sampled weighted selection with a readable shortlist, and a processor-independent entitlement service boundary. Eligibility and selection are wired into the Discovery wheel; mutual/shared modes are not built.
- Local D1 migrations: catalog, relationship/privacy scaffolding, encrypted-payload storage boundaries, commerce/entitlement records and the M2 guest wheel tables; idempotent, generated catalog seed.
- Consent-based minimal CFLab adapter with no private paths/answers, no session identifier, no raw URL/referrer/campaign values and DNT/GPC support. Future product-event names exist without fake event emission.
- GitHub Actions validation → guarded deployment → independent production smoke tests. A durable repository credential is required; missing external authorization is documented rather than replaced with a short-lived token. Read [validation evidence](docs/VALIDATION.md) and the launch report for actual results.

## Read the decisions

| Document                                   | Purpose                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [Product](docs/PRODUCT.md)                 | Audience, differentiation, experience rules, MVP                                          |
| [Wheel](docs/WHEEL.md)                     | Implemented M2 discovery wheel: catalog gate, selection, guest session, accessibility     |
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

Read [Roadmap](docs/ROADMAP.md). The public release does not complete authentication or private product features. The next product milestone is the real discovery wheel with the applicable adult-access review. Private partner data requires the identity/privacy/deletion release gate; purchases require explicit processor suitability and approval. Intended sensitive-feature markets, merchant entity, tax treatment and final private-service legal documents remain decisions. Do not submit merchant applications or contact anyone on the user's behalf without instructions.
