# Decision register

Research/decision date: 2026-11-19. “Accepted” means a foundation architecture choice; it does not authorize deployment or billable provisioning.

Chemistry Check extension: 2026-11-20. [ADR 0005](0005-chemistry-check.md) accepts the independent assessment/privacy boundaries and records a provisional after-Wheel pilot/commercial recommendation. Implementation remains deferred.

Public production extension: [ADR 0006](0006-public-production-launch.md) records the superseding deployment authorization, safe public-only scope, GitHub delivery, minimal CFLab integration and verifiable external-account prerequisites.

| ADR                                              | Status                                          | Decision                                                                                                               |
| ------------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [0001](0001-stack.md)                            | Accepted                                        | Hono + Preact/Vite, static public HTML, one Worker, D1, R2 media deferred                                              |
| [0002](0002-identity-and-consent.md)             | Accepted principles; provider proof provisional | Independent identities and explicit relationships; YES/YES/versioned sharing; Better Auth primary candidate            |
| [0003](0003-commerce.md)                         | Accepted model; processor unselected            | Free core + one-time pack experiment, individual ownership/active-partner sharing, processor-independent grants        |
| [0004](0004-privacy-and-launch-gates.md)         | Accepted boundaries; implementation deferred    | No E2EE claim, no intimate marketing analytics, no private-data/public/payment launch before respective gates          |
| [0006](0006-public-production-launch.md)         | Accepted; verified evidence in launch report    | Public deployment via GitHub Actions with verified revision and live smoke checks                                      |
| [0007](0007-m2-guest-wheel.md)                   | Accepted and implemented (M2)                   | Guest Discovery wheel: gated non-explicit catalog, server-only weighted selection, 24h nonce without stored boundaries |
| [0008](0008-m2-1-fingerprint-and-rate-limits.md) | Accepted; decision 2 superseded by 0009         | HMAC-keyed spin fingerprints and Cloudflare-native rate limits on the public guest endpoints                           |
| [0009](0009-mandatory-fingerprint-key.md)        | Accepted and implemented (M2.1)                 | The fingerprint key is mandatory: no unkeyed mode exists and spins fail closed with a fixed 503 without a valid key    |

[ADR 0010](0010-m3a-identity-and-adult-access.md) accepts the M3A implementation: Better Auth 1.7.27 native D1, Cloudflare email, independent adult declarations, closed restricted-content gates and explicit publication tiers.

Change a material choice through a new ADR and update the affected docs. Record tradeoffs and evidence, not just a package name. Use explicit “supersedes” links rather than silently rewriting history after implementation.
