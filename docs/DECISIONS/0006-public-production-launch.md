# ADR 0006 — Deploy the safe public foundation

Date: 2026-11-20. Status: accepted release architecture; external credentials/verification are operational prerequisites.

The user's production assignment supersedes the initial local-only restriction. It authorizes Git commits/pushes, required Cloudflare resources, public deployment, custom domains, CFLab and Search Console integration and GitHub Actions delivery, without approving unexpected recurring charges or unfinished private features.

Decision: publish a non-explicit public preview and useful honest feature explanations on the existing Hono/Preact/Workers architecture. Add an explicit production D1, server-visible Git/Worker identity, Worker-first canonical/HTTP security handling, static initial-HTML social metadata, original SVG/PNG preview artwork, public-only sitemap and consented minimal CFLab adapter. Keep auth, private matching, Chemistry Check assessments, full games, uploads and billing disabled. R2 stays deferred while all media is public static art.

GitHub main is the release source; validation precedes deployment and independently verified HTTP behavior completes it. A documented initial OAuth bootstrap is allowed only for an already-pushed, CI-validated clean commit when a durable deployment secret is unavailable, and does not count as working GitHub automated deployment. No existing CFLab release gate or identity security is modified. Search Console ownership must be actually verified; a newly added unverified property is not a completed integration.

This updates the deployment authorization statements in [0001](0001-stack.md) and [0004](0004-privacy-and-launch-gates.md) while preserving their modular-monolith, realistic privacy and sensitive-feature gates. [Deployment](../DEPLOYMENT.md), [Analytics](../ANALYTICS.md) and [SEO](../SEO.md) describe actual configurations, privacy boundaries and operational verification.
