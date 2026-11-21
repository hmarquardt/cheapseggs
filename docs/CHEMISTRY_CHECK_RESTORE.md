# Chemistry Check quarantined restore and key operations

A restore is an administrative recovery operation, not an application endpoint. This audit authorizes
only synthetic local drills. Keep live private collection disabled. Never attach an old D1 snapshot to
traffic before sanitation and review. Epochs, sessions, grants and deletion rows inside that snapshot
are historical state, not proof that access is still authorized.

## Conservative restore procedure

1. Freeze **all writers**, including account deletion/sign-in, using an approved maintenance/traffic
   cutover before the recovery cutoff. Record the snapshot time and actual cutoff in Unix seconds.
   Leave the active service untouched if only preparing a drill; use an isolated target with no routes,
   scheduled writers, email delivery or shared production encryption keys. Do not perform a Time Travel
   restore against the live DB while traffic continues.
2. Before losing/replacing the current DB, capture its complete `account_deletions` ledger to a restricted
   off-target location. The input query is `SELECT subject_id AS subjectId, deleted_at AS deletedAt FROM
   account_deletions ORDER BY subject_id`. Wrangler's read-only `d1 execute DB --remote --config
   wrangler.production.jsonc --json --command '<query>'` output must go directly to a restricted file,
   never chat/logs/repository. Validate success and export every row. Also capture the latest cooldown
   ledger if continuity is needed. A surviving off-target ledger with verified continuous coverage can
   replace this capture. A stale export or ledger in the snapshot cannot.
3. Build a restricted JSON manifest from that export:

   ```json
   {
     "completeFrom": 0,
     "completeThrough": 1800000000,
     "source": "operator-verified freeze capture, restricted custody reference",
     "subjects": [{"subjectId": "synthetic-id-only", "deletedAt": 1799999000}]
   }
   ```

   Timestamps/IDs above are examples. `completeFrom` must precede the snapshot and `completeThrough`
   must cover the freeze cutoff. The operator attests completeness from actual capture/custody evidence;
   a JSON timestamp does not prove there were no omitted deletions. If that evidence is unavailable,
   keep the restored system offline. No durable external ledger service is assumed to exist today.
4. Restore/copy only to the isolated target and apply all reviewed migrations there. Generate the exact
   reviewable SQL (does not connect to Cloudflare or select any database):

   ```sh
   node --experimental-strip-types scripts/restore-quarantine.ts /restricted/ledger.json SNAPSHOT_UNIX_SECONDS CUTOFF_UNIX_SECONDS /restricted/reconcile.sql
   ```

   The generator refuses existing output files, sets mode 0600, validates IDs/coverage and rejects
   missing/incomplete manifests. Review the SQL and target binding. Use a separate isolated-target
   Wrangler configuration, with **none** of the production database ID, custom domains or secrets.
   Apply `reconcile.sql` to that isolated binding with `wrangler d1 execute DB --remote --config
   /restricted/wrangler.restore.jsonc --file /restricted/reconcile.sql`. There is no automated routing
   or production-target mutation in this generator.
5. The SQL discards **all** restored Chemistry assessments (cascading invitations, participants,
   approvals, results and private envelopes), all auth sessions and verification challenges, then
   replays account deletions against both identity layers. Rerun the whole idempotent script if
   interrupted; keep the target isolated throughout. Confirm zero assessments/participants/invitations/
   approvals/results, sessions/challenges, no deleted subjects in `auth_user` or `users`, and no FK
   violations. Preserve counterpart independent data only if implemented/reviewed separately; there are
   no reusable templates in this implementation.
6. Reconcile the latest pair cooldown ledger into the isolated target, or keep private collection closed
   through **cutoff + 30 days**. Otherwise a snapshot can roll back recent releases and probing budgets.
   Do not rely on the restored pair ledger to be current. All users must sign in again after recovery.
7. Review the complete reconciliation evidence, current encryption-key inventory, private gates and
   synthetic smoke checks before any separately approved cutover. Missing deletion completeness is a
   hard stop; the 30-day cooldown wait does not remedy an incomplete account-deletion ledger.

`tests/unit/chemistry-private-api.test.ts` performs a real SQLite backup, withdraws a released assessment,
deletes an account, captures the current deletion ledger, then reopens the earlier backup. It demonstrates
that the old session/key **can** read the old report, then executes the generated reconciliation twice
and verifies deletion, no restored invitation authority, no sessions, no private rows and FK integrity.
Actual local D1 independently exercises lifecycle/races and the compiled Worker exercises scheduled purge.
This is not a production disaster-recovery certification or proof of durable off-target ledger custody.

## Bounded maintenance

The production Worker has `17 * * * *` [Cron Trigger](https://developers.cloudflare.com/workers/configuration/cron-triggers/),
not a GitHub scheduled workflow. It operates even with private flags and envelope keys absent. Check its
execution status after deployment/propagation. Before beta, assign monitoring and inspect overdue counts
and oldest expiry/purge age at least daily with aggregate-only operator queries. Each hourly invocation
handles at most 20 rows per expiry category and 20 tombstone deletes; controlled enrollment must stay
below measured capacity with margin. Outages/backlogs can exceed a 24-hour target: investigate, keep
collection closed and run reviewed bounded maintenance batches until current. Do not declare the target
met just because a handler exists. Native Cron uses existing Worker/D1 usage, with no new service plan.

## Rotation and suspected compromise

`CHEMISTRY_ENVELOPE_KEY` is an independently generated base64url 32-byte Worker secret, with explicit
version. Never derive it from an auth/wheel key or reuse key bytes for another version/environment. The
current key encrypts; the bounded previous-key map decrypts older versions. Validate **all** live
participant draft/submission key-version columns and report key versions before retirement, including
retained/withdrawn/expired records. A column/header mismatch fails closed. Normal rotation retains the
previous version until old records are purged/expired; alternatively reseal records in isolation using
the exact original AAD and checked writes, with a separate reviewed migration procedure. No online bulk
rotation endpoint is introduced here. Losing the only copy of an old key is unrecoverable by design.

Test-key drills cover dual-key reads, premature removal denial, recovery by reinstating the retained key,
resealing all three purposes without plaintext changes, retirement and cleanup without keys. No
production key was provisioned. Backups may retain ciphertext after primary deletion and old keys may
make those backups readable; this is not per-person crypto-erasure.

For suspected compromise: close private collection, contain runtime/deploy access, revoke sessions and
assessment grants, assess exposure and follow the incident/legal communication plan. Prefer purging
affected assessments and restarting after review. If data must be preserved, reseal only in isolation,
verify every record's owner/AAD/version and reconcile deletes before retiring the old key. A fresh key
cannot retract data already decrypted with a stolen key. Reopening is a separate founder decision.
