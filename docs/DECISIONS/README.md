# Decision register

Research/decision date: 2026-11-19. “Accepted” means a foundation architecture choice; it does not authorize deployment or billable provisioning.

Chemistry Check extension: 2026-11-20. [ADR 0005](0005-chemistry-check.md) accepts the independent assessment/privacy boundaries and records a provisional after-Wheel pilot/commercial recommendation. Implementation remains deferred.

| ADR                                      | Status                                          | Decision                                                                                                        |
| ---------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [0001](0001-stack.md)                    | Accepted                                        | Hono + Preact/Vite, static public HTML, one Worker, D1, R2 media deferred                                       |
| [0002](0002-identity-and-consent.md)     | Accepted principles; provider proof provisional | Independent identities and explicit relationships; YES/YES/versioned sharing; Better Auth primary candidate     |
| [0003](0003-commerce.md)                 | Accepted model; processor unselected            | Free core + one-time pack experiment, individual ownership/active-partner sharing, processor-independent grants |
| [0004](0004-privacy-and-launch-gates.md) | Accepted boundaries; implementation deferred    | No E2EE claim, no intimate marketing analytics, no private-data/public/payment launch before respective gates   |

Change a material choice through a new ADR and update the affected docs. Record tradeoffs and evidence, not just a package name. Use explicit “supersedes” links rather than silently rewriting history after implementation.
