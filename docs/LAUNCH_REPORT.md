# Public launch evidence

Initial public deployment is live from GitHub; final release verification is in progress. The safe application is public explanations and a non-explicit design preview, not working games or private account features.

## Implemented scope

Nine indexable explanation/policy pages, six original 1200×630 social cards with SVG sources, initial-HTML metadata, canonical redirects, sitemap/robots, safe sample catalog, D1 readiness, release identity and security headers. Auth/payment endpoints fail closed. Chemistry Check remains planned; its public page is an explanation only. No private responses, test accounts, paid service, R2 bucket or payment provider is enabled.

## External integration state

CFLab site `as_v3ng10kbDYMLWnFWOsf52W` is legitimately registered with apex/www domains and seven-day raw retention. The consent adapter is implemented; a real production opt-in browser pageview returned 204 and was read back in reporting storage with no session/referrer/campaign/props fields. No authenticated reporting UI session is available, and none will be fabricated.

Search Console domain property `sc-domain:cheapseggs.com` is DNS-verified. The existing service account and intended human owner have ownership; API readback is `siteOwner`. Site Verification API was enabled in existing project 184307746744. Google accepted the sitemap submission (204), and readback is pending processing with zero initial warnings/errors. No indexing outcome is claimed.

GitHub validation/release workflow and production main-only environment are configured. Durable repository secret `CLOUDFLARE_API_TOKEN` is configured with account/zone scopes documented in the runbook, expiring November 2027. Main requires validation; the production environment allows main only. No manual bootstrap deploy was used.

## Release evidence

Initial GitHub release [44758973504](https://github.com/hmarquardt/cheapseggs/actions/runs/44758973504), commit `407736ce6db2528a664817dc25f43802537733a3`, passed validation and deployed, but smoke verification caught first DNS propagation and then a missing asset-response revision header. The header is corrected after asset dispatch, with browser regression coverage; final release results follow. Read `/api/version` and the production smoke artifact for authoritative runtime identity. See [Deployment](DEPLOYMENT.md) for full resource IDs, recovery procedure, credential scopes and initial bootstrap conditions.

## Remaining product gates

Authentication/session/recovery proof, adult-access and legal review for intended markets, a reviewed real activity catalog, private support channel, private resource authorization/inference defenses/deletion/restore drills, and processor underwriting precede their respective features. The next product milestone is a real bounded guest Discovery Wheel. Chemistry Check should follow the first playable Wheel and its independent identity/privacy gates; compatibility never establishes consent or couple membership.
