# Chemistry Check private backend — security handoff (C1.1, 2026-11-20)

Status: **implemented, tested locally, production-disabled**. Real two-person collection, encrypted
persistence and mutual report release are gated off and must remain off until an independent review
approves this package and both activation flags are deliberately set.

## 1. Threat model and trust boundaries

- Two independently authenticated `users` rows are the only principals. No couple or membership row is
  read or written. A bearer invitation binds one second user; it is not a session or report grant.
- The Worker is trusted for authorization, scope intersection, scoring and envelope handling. D1 is truth
  for lifecycle and access. Clients are untrusted: they cannot name a counterpart, choose an epoch, set a
  deadline, request arbitrary comparisons or read another participant's submission.
- Attackers considered: forwarded invitation links, replay, self-claim, third-account probes, cross-account
  IDs, approval forgery, scope widening, races between release/withdrawal/deletion, backup restore without
  keys, and inference from coarse summaries.
- Residual risk: coarse bands reveal aggregate information to a participant who knows their own answers.
  Rate limits and the 30-day cooldown reduce but cannot eliminate inference or coercion. No endpoint exposes
  counterpart progress, skipped items or directional scores.

## 2. New D1 tables and migrations

`migrations/0007_chemistry_check.sql` and `0008_chemistry_invitation_label.sql` (append-only):

| Table                         | Purpose                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chemistry_assessments`       | Opaque id, manifest/bank/algorithm versions, depth, status, `result_epoch`, pair key, deadlines, tombstone/purge timestamps. A unique partial index enforces one live assessment per unordered pair + family. |
| `chemistry_participants`      | Exactly two slots (`creator`=1, `invitee`=2), immutable identity trigger, monotonic draft/submission revisions, encrypted draft and submission plus key version/digest.                                       |
| `chemistry_invitations`       | One per assessment, SHA-256 token digest only, 48h expiry, terminal-state trigger, minimal `invitee_label`, consumed-by binding.                                                                              |
| `chemistry_release_approvals` | Per assessment/user/epoch: exact submission revision, manifest, scope digest/JSON, deadline.                                                                                                                  |
| `chemistry_results`           | One encrypted report per assessment/epoch, only insertable while the assessment is `awaiting_release` (trigger).                                                                                              |
| `chemistry_pair_releases`     | Cooldown ledger keyed by unordered pair + family; survives account and assessment deletion.                                                                                                                   |
| `chemistry_budgets`           | Keyed HMAC counters with expiry; no raw IP, email or user id.                                                                                                                                                 |

Deleting either account fires `chemistry_account_delete` before the `users` row disappears and deletes every
assessment the user created or joined, cascading participants, invitations, approvals, results and
envelopes. The pair ledger remains.

## 3. Encryption and key management

- AES-256-GCM via WebCrypto, fresh 96-bit nonce per envelope, 128-bit tag, 512-byte padded plaintext.
- AAD binds purpose plus server-derived assessment id, participant id, revision, manifest and, for reports,
  result epoch and shared scope digest. Ciphertext cannot be moved between participants or revisions.
- Keys: `CHEMISTRY_ENVELOPE_KEY` (base64url 32 bytes), `CHEMISTRY_ENVELOPE_KEY_VERSION`, optional
  `CHEMISTRY_ENVELOPE_PREVIOUS_KEYS`. Missing, short or malformed keys make the entire private namespace
  return 404. `SPIN_DIGEST_KEY` and `BETTER_AUTH_SECRET` are never encryption keys.
- Rotation: deploy the new key as current, keep old versions for decryption until every readable envelope
  expires (assessment 14 days, report 30 days) or is re-sealed, then remove them. Losing a version makes its
  envelopes unrecoverable by design; there is no plaintext fallback.
- No plaintext answer, prompt or report is stored in D1, logs, URLs, analytics, browser storage or public
  assets.

## 4. Invitation lifecycle and replay defenses

The creator supplies a 1–40 character label; accepting requires the normalized confirmation label. The raw
32-byte token appears once in the response and is placed in the URL fragment (`#invite=`), never sent as a
request parameter. Only its SHA-256 digest is stored. Accept runs one D1 batch: conditional pending/
unexpired/non-self consume → conditional slot-2 insert → conditional `collecting` transition. Any
zero-change result terminates the assessment. Concurrent claims admit exactly one; replay, third-account,
self, expired, revoked, wrong-label and duplicate-pair claims all return the same `404 not_found`.
Revocation is neutral and clears envelopes.

## 5. Mutual release protocol

Each participant approves a dimension list, intimacy opt-in, hard-signal opt-in and the server-canonical
`accepted_at + 30d` deadline for their exact current submission revision and epoch. Approval stores a SHA-256
digest over manifest, epoch, revision and scope. Release recomputes both digests, requires equal deadlines,
intersects dimensions (`AND` for intimacy/hard-signal flags), decrypts both submissions and re-scores with
the existing engine. Any submission edit or post-submission draft save increments `result_epoch`, deletes
approvals and deletes any result. Final insertion is conditional on `awaiting_release`, the current epoch,
both approval rows and both revision digests, followed by an assessment update guarded by the new result in
the same batch. A withdrawal race either prevents the insert or deletes the result; every read re-checks
status, epoch, result and deadline.

## 6. Disclosure non-interference evidence

- The comparable set requires both answered, both acceptance rules known, both summary-authorized and
  matching versions. Private-only responses are excluded before scoring.
- Unit tests prove private answer content, weights and hard rules produce a byte-identical report; two HTTP
  pairs with different private answers produce equal released reports and never echo private labels.
- Approvals are the authoritative release flags; unshared dimensions become `outside_approved_scope`, and
  one-sided intimacy/hard-signal approvals narrow rather than block. No owner, question, count, weight,
  directional score or overall percentage is serialized.

## 7. Cross-account authorization tests

`tests/unit/chemistry-private-api.test.ts` uses real Better Auth sessions for at least three accounts per
scenario: self/third/replay claims, concurrent claims, draft ownership, cross-account assessment reads,
withdrawal, account deletion, cooldown, invitation budgets, tampered approvals and tampered envelopes. Every
foreign private resource returns generic 404. Chemistry middleware is scoped to `/chemistry-check/*`; the
unchanged wheel, recipe, Date Night and account suites verify no intercepting regression.

## 8. Expiration, deletion and restore

- Invitation 48h; assessment 14d from acceptance; report 30d from acceptance; terminal purge grace 24h; pair
  cooldown 30d. Middleware runs bounded opportunistic cleanup per private request: 20 assessments per
  category, 20 pending invitations, 100 budgets. Production collection stays disabled until a scheduled or
  operationally verified purge job is approved as an additional control.
- Withdrawal, decline and expiry clear both participants' draft and submission envelopes, delete approvals
  and results, revoke pending invitations and leave a minimal status/purge row. Account deletion removes the
  assessment entirely through trigger and cascade.
- Backup restore: restored ciphertext without the matching key version fails closed and reads return 404.
  Restored assessments must still satisfy current session, participant, epoch and deadline checks, so a
  restore cannot revive a deleted report without the deleted result row.

## 9. Abuse controls and limitations

Five creations per account per day; three pending invitations; one live assessment per pair/family; 30
release attempts/hour; 240 private requests per 15 minutes per edge address in production; 128 KiB bounded
streaming body; maximum 100 responses; strict Zod shapes. Counters are HMACed with the auth secret under a
domain-separated label, so no raw identifier is stored. Known limits: aggregate inference from small bands
remains; a forwarded link can still reach the wrong person if they know the label; account aliases can widen
pair probing; cleanup is opportunistic while the feature is disabled.

## 10. Production activation checklist (all required)

1. Independent Codex/Sol review of this handoff, migrations, envelopes, routes and tests.
2. Provision `CHEMISTRY_ENVELOPE_KEY` as a Worker secret (32 random bytes, base64url); record version 1.
3. Approve and operationalize the bounded purge/expiry job; run a deletion and restore drill in staging.
4. Verify production `/api/version` reports `chemistryPrivate: false` and
   `/api/v1/chemistry-check/status` returns 404 with no key or flags.
5. Enable `CHEMISTRY_PRIVATE_ENABLED=true` **and** `CHEMISTRY_PRIVATE_REVIEW_APPROVED=true` only after
   written approval; both are required in production.
6. Smoke-test two real accounts: create, confirm label, accept, draft, submit both, approve the same scope,
   release, identical reports, edit invalidation, withdrawal and account deletion.
7. Confirm CFLab receives no assessment data, private paths remain no-store/noindex, and no answer appears in
   logs, URLs, assets or error responses.
