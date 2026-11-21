import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";

// This builds a reviewable SQL file only. It never selects a database or routes traffic.
const ledgerSchema = z
  .object({
    completeFrom: z.number().int().nonnegative(),
    completeThrough: z.number().int().nonnegative(),
    source: z.string().min(1).max(200),
    subjects: z
      .array(
        z
          .object({
            subjectId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
            deletedAt: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(100000),
  })
  .strict();

export function restoreQuarantineSql(ledger: unknown, snapshotAt: number, cutoff: number): string {
  const parsed = ledgerSchema.parse(ledger);
  if (
    !Number.isSafeInteger(snapshotAt) ||
    !Number.isSafeInteger(cutoff) ||
    snapshotAt > cutoff ||
    parsed.completeFrom > snapshotAt ||
    parsed.completeThrough < cutoff ||
    parsed.subjects.some((row) => row.deletedAt > parsed.completeThrough)
  ) {
    throw new Error("incomplete_deletion_ledger");
  }
  // Coverage is an operator attestation backed by the external ledger, not something this
  // database can prove. Any uncertainty means quarantine continues. Account triggers cascade.
  return [
    "-- ISOLATED RESTORE TARGET ONLY. Keep production gates closed and all traffic disconnected.",
    "PRAGMA foreign_keys = ON;",
    // Conservatively invalidate ALL assessments, so no withdrawal ledger is needed to keep
    // old report grants/invitations/private answers. Lost assessments must be recreated.
    "DELETE FROM chemistry_assessments;",
    "DELETE FROM auth_session;",
    "DELETE FROM auth_verification;",
    ...parsed.subjects.flatMap((row) => [
      `INSERT OR IGNORE INTO account_deletions(subject_id,deleted_at) VALUES ('${row.subjectId}',${row.deletedAt});`,
      `DELETE FROM auth_user WHERE id = '${row.subjectId}';`,
      `DELETE FROM users WHERE auth_subject = '${row.subjectId}';`,
    ]),
    // SQL is idempotent; interrupted application stays isolated and is rerun in full.
    "PRAGMA foreign_key_check;",
    "SELECT (SELECT count(*) FROM chemistry_assessments) AS assessments, (SELECT count(*) FROM auth_session) AS sessions, (SELECT count(*) FROM auth_verification) AS challenges;",
    "",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [ledgerPath, snapshotAt, cutoff, output] = process.argv.slice(2);
  if (!ledgerPath || !snapshotAt || !cutoff || !output)
    throw new Error(
      "usage: restore-quarantine.ts LEDGER_JSON SNAPSHOT_UNIX_SECONDS CUTOFF_UNIX_SECONDS OUTPUT_SQL",
    );
  writeFileSync(
    output,
    restoreQuarantineSql(
      JSON.parse(readFileSync(ledgerPath, "utf8")),
      Number(snapshotAt),
      Number(cutoff),
    ),
    { mode: 0o600, flag: "wx" },
  );
}
