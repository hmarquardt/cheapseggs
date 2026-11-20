# CheapSeggs

**Cheap Seggs. Priceless Memories.** Playful discovery for consenting adults, with boundaries built into the product.

This repository is a researched product architecture and **local-only foundation**, not a production application. No live resources, production deployment, authentication provider, email delivery, or payment processor have been enabled. The GitHub repository is [hmarquardt/cheapseggs](https://github.com/hmarquardt/cheapseggs); intended production domain: `cheapseggs.com`.

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
npm run check        # lint, types, unit tests, fresh SQLite checks, frontend + Worker dry run
npm run db:seed      # safe to repeat
npm run db:check
npx playwright install chromium
npm run test:e2e     # local Worker, desktop + mobile, accessibility and API smoke checks
```

`npm run build` invokes **`wrangler deploy --dry-run`** to compile only. There is deliberately no deploy script, live database ID, R2 binding, route, scheduled job, or production configuration. Do not remove `--dry-run` to publish this foundation.

## What exists

- Static public landing/privacy pages and a small Preact lounge preview with an in-memory adults-only acknowledgement and mode explanations. The acknowledgement is **not age verification**. No playable wheel yet.
- Hono API: liveness, D1 readiness, and three deliberately public non-explicit sample catalog records; auth/payment namespaces return 503 and other unimplemented APIs return 404.
- Zod catalog model, pure eligibility policy, rejection-sampled selection primitive, and a processor-independent entitlement service boundary. These are not wired into shared games.
- Local D1 migration: catalog, relationship/privacy scaffolding, encrypted-payload storage boundaries, commerce/entitlement records; idempotent sample seed.
- CI validation without deployment or credentials. Read [validation evidence](docs/VALIDATION.md) for what actually ran.

## Read the decisions

| Document                                   | Purpose                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [Product](docs/PRODUCT.md)                 | Audience, differentiation, experience rules, MVP                                          |
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
seeds/           safe local fixtures only
scripts/         fresh-database verification
tests/unit/      consent, entitlement, randomness, API boundaries
tests/browser/   local runtime/UI/accessibility smoke tests
public/          only public assets; CSP and indexing restrictions
docs/            product, commercial research, architecture, ADRs
```

## Before a launch

Read [Roadmap](docs/ROADMAP.md). First complete authentication/age-assurance proof and the real wheel milestone. Private partner data requires the privacy release gate; purchases require explicit processor underwriting and approval. Intended markets, merchant entity, tax treatment, final privacy/legal documents, and production operations remain decisions. Do not submit merchant applications or contact anyone on the user's behalf without instructions.
