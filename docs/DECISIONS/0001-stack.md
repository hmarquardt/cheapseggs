# ADR 0001 — Small Cloudflare modular monolith

Status: accepted for foundation.

Context: mobile games need reusable stateful UI; public pages need little JavaScript; operating cost and simplicity matter. No team/ecosystem constraint requires React/Next.js.

Decision: Preact/Vite for the interactive lounge and future games, static public HTML, Hono Fetch API Worker, direct bound SQL D1 domain queries, versioned catalog, REST/OpenAPI. One deployment component. R2 media only when needed. No KV security authority, Durable Objects, queue, AI service or microservices initially.

Alternatives: vanilla TypeScript minimizes runtime but increases UI coordination work; SvelteKit has attractive integrated routing/SSR and remains the strongest alternative if editorial/server-rendered forms expand. React/Next.js adds framework surface without a demonstrated requirement.

Consequences: explicit build/routing and duplicate static/API header configuration must be tested. Domain code stays transport-independent. Current frontend JS gzip is measured in the validation report, not assumed from marketing benchmarks. See [Architecture](../ARCHITECTURE.md) for official compatibility sources and diagrams. Production/staging configs are deferred; local IDs and dry-run build prevent accidental assumptions about live resources.
