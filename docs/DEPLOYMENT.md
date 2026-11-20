# Cloudflare release and operations

Production assignment authorized 2026-11-20. It supersedes the original local-only work restriction; historical ADRs describe the earlier stage. Do not infer that sensitive features are approved simply because the public shell may be deployed.

## Source and environment boundaries

GitHub `hmarquardt/cheapseggs`, branch `main`, is canonical. Commit reviewable work, fetch before pushing and never force-push. The first foundation commit is `984952e34e073690f29350efdaf373059addbdd3`; its validation run is [44755167323](https://github.com/hmarquardt/cheapseggs/actions/runs/44755167323). Actual current production identity is read from `https://cheapseggs.com/api/version`, not inferred from local files or an upload message.

Local config: `wrangler.jsonc`, local Worker name, all-zero local D1 ID, no live routes. Production config: `wrangler.production.jsonc`, explicit account/resource IDs and apex/www custom domains. No shared local production data or credentials. No runtime auth/email/payment keys exist. API version returns the commit and Cloudflare version metadata; health/readiness return no SQL/errors/private records. Invocation/application request logging stays disabled.

## Resource inventory

| Resource                         | Name / identifier                                            | Status / purpose                                                                                                 |
| -------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Cloudflare account               | b1aa310aa0a1638d72b8b086a21e557c                             | Existing; Workers Standard usage model already configured                                                        |
| Zone                             | cheapseggs.com / 3f54cc8fa4f93859b8b38c818ccfd015            | Existing active Free Website zone; existing nameservers retained                                                 |
| Worker                           | cheapseggs                                                   | Created/deployed and verified, one modular monolith plus static assets                                           |
| Custom domains                   | cheapseggs.com; www.cheapseggs.com                           | Active HTTPS custom domains verified; Worker redirects www to apex with 308                                      |
| Production D1                    | cheapseggs-production / ef9ff0b0-97d5-428b-81df-cd02fe342bb8 | Created 2026-11-20; only public editorial samples are seeded                                                     |
| Local D1                         | cheapseggs-local / all-zero config ID                        | Local emulator only, not a Cloudflare production resource                                                        |
| R2                               | None created                                                 | Media remains Workers static assets; future private/premium media bucket deferred by ADR                         |
| CFLab site                       | cheapseggs / as_v3ng10kbDYMLWnFWOsf52W                       | Registered in existing analytics service, seven-day raw retention                                                |
| Extra Workers/KV/DO/queues/crons | None                                                         | Not needed for safe public release                                                                               |
| GitHub production environment    | production, main branch only                                 | Created for release job                                                                                          |
| GitHub repository variable       | CLOUDFLARE_DEPLOY_ENABLED=true                               | Explicit new-project release gate; not the gate of another repository                                            |
| GitHub secret                    | CLOUDFLARE_API_TOKEN                                         | Configured 2026-11-20; scoped cheapseggs-github-deploy token, expires 2027-11-21 05:59:59 UTC                    |
| Worker secret                    | SPIN_DIGEST_KEY                                              | Set 2026-11-20 (`wrangler secret put`, 32+ random bytes); HMAC key for spin fingerprints, rolls deploy to deploy |
| Rate limit bindings              | SPIN_RATE_LIMITER, WHEEL_RATE_LIMITER                        | Declared in both Wrangler configs; Cloudflare-native counters, no extra service or billing                       |
| Search Console                   | sc-domain:cheapseggs.com                                     | Verified domain; intended human owner plus existing service account, sitemap submitted (pending processing)      |

Account/zone/database/site IDs are configuration, not secrets. Do not include authentication token values, Google JSON/private key, passwords or browser sessions in this inventory. No R2 bucket is needed to host public social cards. Creating one for an unused binding would add operational surface without a requirement.

## Normal CI/CD

`.github/workflows/ci.yml`: push `main` or dispatch → validate → production environment deploy → independent HTTP smoke checks. PRs validate only. There are no scheduled drift or deployment workflows. Workflow concurrency does not cancel an in-progress production release.

Validation installs the exact lockfile, runs lint/types, target/config and PNG checks, unit/API/privacy tests, fresh SQLite migration/seed constraints, both builds, actual local D1 migrations/idempotent seed/readback and desktop/mobile browser/accessibility/social/analytics tests. Deployment checks the same commit/branch/repository, refuses dirty sources/missing credentials, builds the public assets, records a D1 Time Travel bookmark, applies reviewed migrations remotely, seeds only the three reviewed non-explicit sample ideas, and runs Wrangler with `--no-x-provision`, commit tag and `DEPLOY_REVISION:<sha>`.

The production verify step allows at most 12 observations per response with five-second pauses, within one shared 90-second propagation deadline. It requires the exact response revision at each endpoint because different requests may hit different deployment edges. HTTP application errors and all content/security assertions fail immediately. It checks version/commit, apex HTTPS, www redirect, public routes, browser/Facebook/X/LinkedIn initial HTML equality, metadata/image dimensions, static assets, sitemap/robots, health, database readiness, safe sample API, CSP/security headers, private-route noindex/no-store and disabled auth/payment APIs. It uploads `artifacts/production-smoke.json` to the run with 14-day retention. Never call a release successful if that step fails. Social-crawler HTTP checks are not a claim of a platform-rendered preview.

### Worker secret: SPIN_DIGEST_KEY

The guest wheel persists an idempotency fingerprint per spin. Without a key that fingerprint is an
ordinary hash of a small, enumerable boundary configuration, which a database or backup reader
could attack offline (`docs/WHEEL.md`, `docs/SECURITY.md`). Provision the key once per Worker:

```sh
# 32+ random bytes; keep the value out of the shell history and out of the repository
openssl rand -hex 32 | npx wrangler secret put SPIN_DIGEST_KEY --config wrangler.production.jsonc
```

Secrets survive `wrangler deploy`, so the release workflow does not need to set it again. Two
consequences to plan for:

- `GET /api/version` reports `spinDigestKeyed`. The production verify step fails when it is false, so
  a release that loses the secret is not reported green.
- Rotating the key (or shipping new digest logic) makes the previous 24 hours of stored fingerprints
  unable to match. In-flight retries then receive `409 spin_conflict`, which the interface already
  explains; no result is lost and no boundary is widened.

Local development and unit tests run without the key on purpose: the fallback is exercised and
`/api/version` shows `spinDigestKeyed: false` there.

### Deployment credential

Set repository secret `CLOUDFLARE_API_TOKEN` through GitHub's encrypted secrets UI or `gh secret set` over stdin. Required practical scopes: Workers Scripts Edit and D1 Edit on this account, Zone Read and Workers Routes Edit scoped to `cheapseggs.com`. If DNS verification automation is added, DNS Edit must be scoped to this zone too. Do not use a global API key, unrelated R2/backup token, copied browser session, a generated admin session, or a short-lived local Wrangler access token. The existing local OAuth session is not a durable GitHub credential and cannot create API tokens with its current permissions.

The actual deployment token was created through the authenticated owner dashboard and piped directly into GitHub Secrets without displaying or committing its value. It has Workers Scripts Edit + D1 Edit for this account and Workers Routes Edit + Zone Read only for the CheapSeggs zone; no DNS write or token-management scope. Rotate before 2027-11-21 05:59:59 UTC. Cloudflare account-scoped permissions can affect other Workers/D1s in that account; the release script also checks the exact repository, branch, account and DB targets.

Do not print or commit secrets. Tokens are read only by the main deployment job, not by PR validation or the public app. The production environment restricts deployments to `main`. Main requires the `validate` status context and disallows force pushes/deletion. Owner/admin bypass remains available for direct early-project commits; deployment still independently requires validation of the same SHA. A missing secret is a real failed release gate; do not report it as a successful/skipped production deployment.

### Initial bootstrap exception

The user explicitly authorized production deployment. If the durable GitHub secret is unavailable, a **documented initial bootstrap** may use the existing local Wrangler OAuth session, but only after committing/pushing and a successful GitHub `validate` job for that exact `main` SHA. Verify `HEAD == origin/main`, an empty working tree, target config and local checks. Record the D1 bookmark, run the same migration/seed and deploy flags as `scripts/release.mjs`, then run `EXPECTED_REVISION=<sha> npm run smoke:production` independently. Do not pretend this makes continuous deployment operational; the GitHub deploy job remains blocked until its own authenticated release and smoke checks succeed.

This exception does not apply to CFLab or any other repository and does not relax their existing release/migration gates. Do not keep manually publishing new feature work to avoid fixing CI credentials.

## Domains, public content and sensitive features

Wrangler manages the two custom domains and HTTPS certificates. Worker-first handling applies headers and canonical redirects consistently to assets and APIs. Production HTTP GET/HEAD redirects to HTTPS apex; insecure mutation requests are rejected. Public canonical URLs use trailing slashes; aliases/index.html redirect permanently. Sitemap contains exactly the nine useful public explanation/policy pages. The preview `/play/`, APIs, account/auth/invitation/assessment/result paths and 404s are noindex; private placeholders return generic 404/503 without a catch-all SPA fallback. No real private route or authentication cookie is active.

Auth sessions, private preference/assessment storage, email, live wheel/recipe generation, payments and uploads remain disabled. No real users, sessions, couple preferences, questionnaire responses or card data are seeded. The adult acknowledgement in the non-explicit preview is not age verification. Actual adult content/private-data features still require the documented market, age-assurance, identity, privacy/deletion and legal gates. A dedicated private support channel is required before private customer workflows open.

## Recovery and rollback

For a failed upload or smoke test, inspect that run and `/api/version` before doing anything else. Preserve the intended commit and exact failure; do not silence tests or assume the next push repairs a partial release. This project has one Worker, reducing partial-upload coordination, but D1 migration state is separate from Worker versions.

Prefer a validated revert commit on `main`, then the normal pipeline. A deliberate emergency `wrangler rollback <version-id> --config wrangler.production.jsonc` changes code/assets/bindings but **does not roll back D1**; verify the previous code remains compatible with applied migrations. Record the previous/current Worker version, Git SHA and smoke results. Never roll back data blindly to recover a UI bug.

Migrations are append-only. Test locally first, review against the deployed schema, record the Time Travel bookmark immediately before remote changes, use additive expand/backfill/contract releases and require a concrete recovery plan for destructive work. Paid D1 Time Travel retention follows Cloudflare account capabilities (currently modeled as 30 days). Restore first into an isolated target and replay deletion/revocation records before any future private data is served. No backup bucket, new recurring backup job or paid service was activated for this empty/private-disabled launch.

## Costs and pending external actions

No new subscription, paid third-party service, AI model, email transport or R2 bucket was enabled. The new Worker/D1 use the existing account's allowances and usage billing; requests, CPU and storage can incur overage as traffic grows. Worker-first handling means public requests invoke the Worker. Public GitHub Linux Actions use the existing account's applicable allowance. CFLab uses its existing shared infrastructure. See COSTS.md for estimates, not a promise of zero billing.

The live launch report must distinguish: deployed public functionality, GitHub validation/deployment state, actual Worker version/SHA, independent smoke evidence, real CFLab ingestion/report readback and Search Console verification/submission blockers. Never publish credentials to close a reporting gap.
