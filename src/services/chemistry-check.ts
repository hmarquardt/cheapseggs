/**
 * Chemistry Check private assessment service.
 *
 * Every function here assumes the caller already passed the explicit production gate and
 * owns the authenticated user id. All authorization is assessment-participant scoped; no
 * function accepts a counterpart identifier from the client. No couple record is created.
 */
import { z } from "zod";
import {
  CHEMISTRY_BANK_VERSION,
  type ChemistryDepth,
  type ChemistryDimensionId,
  MANIFESTS,
} from "../content/chemistry/questions";
import {
  type AssessmentSubmission,
  buildSharedReport,
  evaluateCompatibility,
  type SharedReport,
  validateSubmission,
} from "../domain/chemistry";
import {
  ACTIVE_INVITATION_LIMIT,
  assessmentExpiresAt,
  CHEMISTRY_ALGORITHM_VERSION,
  CHEMISTRY_FAMILY,
  type ChemistryStatus,
  DAILY_INVITATION_LIMIT,
  INVITATION_TTL_SECONDS,
  intersectScopes,
  isTerminal,
  normalizeScope,
  PAIR_COOLDOWN_SECONDS,
  pairKey,
  purgeAt,
  type ReleaseScope,
  reportExpiresAt,
  scopeMaterial,
} from "../domain/chemistry-lifecycle";
import type { Bindings } from "../server/bindings";
import { ADULT_POLICY, AUTH_IDLE } from "./auth";
import {
  type ChemistryKeyring,
  envelopeAad,
  loadChemistryKeyring,
  openEnvelope,
  sealEnvelope,
} from "./chemistry-envelope";

export const MAX_REQUEST_BYTES = 128 * 1024;
export const REPORT_DIMENSIONS: readonly ChemistryDimensionId[] = [
  "goals",
  "lifestyle",
  "communication",
  "values",
  "affection",
  "intimacy",
  "adventure",
  "humor",
];

/** Production stays closed unless both the operator flag and the review flag are set. */
export function chemistryPrivateEnabled(env: Bindings): boolean {
  if (!["production", "local"].includes(env.APP_ENV) || env.CHEMISTRY_PRIVATE_ENABLED !== "true")
    return false;
  if (env.APP_ENV !== "local" && env.CHEMISTRY_PRIVATE_REVIEW_APPROVED !== "true") return false;
  return true;
}

export async function chemistryKeyring(env: Bindings): Promise<ChemistryKeyring | null> {
  if (!chemistryPrivateEnabled(env)) return null;
  return loadChemistryKeyring(env);
}

export async function adultDeclared(env: Bindings, userId: string, now: number): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT policy_version, expires_at FROM account_declarations WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ policy_version: string; expires_at: number }>();
  return Boolean(row && row.policy_version === ADULT_POLICY && row.expires_at > now);
}

export function randomToken(bytes = 32): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Keyed abuse counters: no raw IP address, email address or user id is stored. */
export async function takeChemistryBudget(
  env: Bindings,
  scope: string,
  value: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) return false;
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.BETTER_AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`chemistry-budget-v1|${scope}|${window}|${value}`),
  );
  const digest = Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  try {
    const row = await env.DB.prepare(
      `INSERT INTO chemistry_budgets(key,count,expires_at) VALUES (?,1,?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`,
    )
      .bind(digest, (window + 1) * windowSeconds)
      .first<{ count: number }>();
    return Boolean(row && row.count <= limit);
  } catch {
    return false;
  }
}

export interface AssessmentRow {
  id: string;
  family: string;
  manifest_id: string;
  question_bank_version: string;
  algorithm_version: string;
  depth: number;
  status: ChemistryStatus;
  result_epoch: number;
  pair_key: string | null;
  created_by: string;
  created_at: number;
  invited_at: number | null;
  accepted_at: number | null;
  assessment_expires_at: number | null;
  released_at: number | null;
  report_expires_at: number | null;
  terminated_at: number | null;
  purge_after: number | null;
}

export interface ParticipantRow {
  assessment_id: string;
  user_id: string;
  slot: number;
  role: "creator" | "invitee";
  joined_at: number;
  draft_revision: number;
  draft_envelope: string | null;
  draft_key_version: number | null;
  draft_updated_at: number | null;
  submission_revision: number | null;
  submitted_at: number | null;
  submission_envelope: string | null;
  submission_key_version: number | null;
  submission_digest: string | null;
  withdrawn_at: number | null;
}

export interface InvitationRow {
  id: string;
  assessment_id: string;
  created_by: string;
  created_at: number;
  expires_at: number;
  state: "pending" | "consumed" | "revoked" | "expired";
  invitee_label: string | null;
  consumed_at: number | null;
  consumed_by: string | null;
}

export interface ApprovalRow {
  assessment_id: string;
  user_id: string;
  result_epoch: number;
  submission_revision: number;
  manifest_id: string;
  scope_digest: string;
  scope_json: string;
  approved_at: number;
  expires_at: number;
}

export interface OwnAssessmentView {
  id: string;
  depth: ChemistryDepth;
  manifestId: string;
  status: ChemistryStatus | "closed";
  createdAt: number;
  acceptedAt: number | null;
  assessmentExpiresAt: number | null;
  reportExpiresAt: number | null;
  role: "creator" | "invitee";
  own: {
    submitted: boolean;
    submissionRevision: number | null;
    draftRevision: number;
  };
  invitation: { expiresAt: number; state: InvitationRow["state"] } | null;
  reportAvailable: boolean;
}

const responseSchema = z
  .object({
    questionId: z.string().regex(/^[a-z0-9-]{1,80}$/),
    questionVersion: z.number().int().min(1).max(1000),
    state: z.enum(["answered", "skipped", "not_applicable"]),
    own: z.array(z.string().regex(/^[a-z0-9-]{1,60}$/)).max(8),
    accept: z.union([
      z.literal("any"),
      z.array(z.string().regex(/^[a-z0-9-]{1,60}$/)).max(8),
      z.null(),
    ]),
    importance: z.enum(["none", "low", "medium", "high"]),
    dealbreaker: z.boolean(),
    disclosure: z.enum(["summary", "private"]),
  })
  .strict();

const submissionSchema = z
  .object({
    depth: z.union([z.literal(25), z.literal(50), z.literal(100)]),
    manifestId: z.string().min(1).max(100),
    questionBankVersion: z.string().min(1).max(100),
    responses: z.array(responseSchema).max(100),
    intimacyShared: z.boolean(),
    hardSignal: z.boolean(),
  })
  .strict();

/** Strict shape plus manifest/version validation. Returns null for any invalid payload. */
export function parseSubmissionPayload(value: unknown): AssessmentSubmission | null {
  const parsed = submissionSchema.safeParse(value);
  if (!parsed.success) return null;
  const submission = parsed.data as AssessmentSubmission;
  if (submission.responses.length > MANIFESTS[submission.depth].questions.length) return null;
  if (validateSubmission(submission).length > 0) return null;
  return submission;
}

export function submissionAad(input: {
  assessmentId: string;
  userId: string;
  revision: number;
  manifestId: string;
}): string {
  return envelopeAad([
    "submission",
    input.assessmentId,
    input.userId,
    String(input.revision),
    input.manifestId,
  ]);
}

export function draftAad(input: {
  assessmentId: string;
  userId: string;
  revision: number;
  manifestId: string;
}): string {
  return envelopeAad([
    "draft",
    input.assessmentId,
    input.userId,
    String(input.revision),
    input.manifestId,
  ]);
}

export function reportAad(input: {
  assessmentId: string;
  resultEpoch: number;
  sharedDigest: string;
}): string {
  return envelopeAad(["report", input.assessmentId, String(input.resultEpoch), input.sharedDigest]);
}

export async function assessmentAndParticipant(
  env: Bindings,
  assessmentId: string,
  userId: string,
): Promise<{ assessment: AssessmentRow; participant: ParticipantRow } | null> {
  if (!/^[0-9a-f-]{36}$/.test(assessmentId)) return null;
  const assessment = await env.DB.prepare(
    `SELECT * FROM chemistry_assessments a
     WHERE a.id = ? AND EXISTS (
       SELECT 1 FROM chemistry_participants p
       WHERE p.assessment_id = a.id AND p.user_id = ?
     )`,
  )
    .bind(assessmentId, userId)
    .first<AssessmentRow>();
  if (!assessment) return null;
  const participant = await env.DB.prepare(
    "SELECT * FROM chemistry_participants WHERE assessment_id = ? AND user_id = ?",
  )
    .bind(assessmentId, userId)
    .first<ParticipantRow>();
  return participant ? { assessment, participant } : null;
}

/** Independent of cleanup: an expired or terminated assessment is never usable. */
function writableAssessment(assessment: AssessmentRow, now: number): boolean {
  return (
    ["invited", "collecting", "awaiting_release"].includes(assessment.status) &&
    assessment.terminated_at === null &&
    (assessment.assessment_expires_at === null || assessment.assessment_expires_at > now)
  );
}

// Session id comes only from Better Auth. Check it in the SAME final D1 operation as
// assessment state, so a second auth await cannot open another revocation window.
const SESSION_STATE = `(? IS NULL OR EXISTS (SELECT 1 FROM auth_session s JOIN users u ON u.auth_subject = s.userId
  WHERE s.id = ? AND u.id = ? AND u.deletion_requested_at IS NULL AND s.expiresAt > ? AND s.updatedAt > ?))`;
function sessionBindings(sessionId: string | undefined, userId: string, now: number) {
  const checkedAt = Math.max(now * 1000, Date.now());
  return [
    sessionId ?? null,
    sessionId ?? null,
    userId,
    new Date(checkedAt).toISOString(),
    new Date(checkedAt - AUTH_IDLE * 1000).toISOString(),
  ];
}

const WRITE_STATE = `EXISTS (SELECT 1 FROM chemistry_assessments a
  WHERE a.id = chemistry_participants.assessment_id AND a.result_epoch = ?
    AND a.status IN ('invited','collecting','awaiting_release') AND a.terminated_at IS NULL
    AND (a.assessment_expires_at IS NULL OR a.assessment_expires_at > ?)
    AND (a.status <> 'invited' OR EXISTS (SELECT 1 FROM chemistry_invitations i
      WHERE i.assessment_id = a.id AND i.state = 'pending' AND i.expires_at > ?)))`;

export async function terminateAssessment(
  env: Bindings,
  assessmentId: string,
  status: "declined" | "withdrawn" | "expired" | "deleted",
  now: number,
): Promise<boolean> {
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE chemistry_assessments
       SET status = ?, result_epoch = result_epoch + 1, terminated_at = ?,
           purge_after = ?, pair_key = NULL
       WHERE id = ? AND status NOT IN ('declined','withdrawn','expired','deleted')`,
    ).bind(status, now, purgeAt(now), assessmentId),
    env.DB.prepare("DELETE FROM chemistry_results WHERE assessment_id = ?").bind(assessmentId),
    env.DB.prepare("DELETE FROM chemistry_release_approvals WHERE assessment_id = ?").bind(
      assessmentId,
    ),
    env.DB.prepare(
      `UPDATE chemistry_participants
       SET withdrawn_at = ?, draft_envelope = NULL, draft_key_version = NULL,
           submission_envelope = NULL, submission_key_version = NULL, submission_digest = NULL
       WHERE assessment_id = ?`,
    ).bind(now, assessmentId),
    env.DB.prepare(
      "UPDATE chemistry_invitations SET state = 'revoked' WHERE assessment_id = ? AND state = 'pending'",
    ).bind(assessmentId),
  ]);
  return (results[0]?.meta.changes ?? 0) > 0;
}

/** Bounded hourly maintenance, also used opportunistically; no collection/key prerequisite. */
export async function purgeExpired(env: Bindings, now: number): Promise<void> {
  const expired = await env.DB.prepare(
    `SELECT id FROM chemistry_assessments
       WHERE status IN ('collecting','awaiting_release') AND assessment_expires_at IS NOT NULL
         AND assessment_expires_at <= ? LIMIT 20`,
  )
    .bind(now)
    .all<{ id: string }>();
  for (const row of expired.results) await terminateAssessment(env, row.id, "expired", now);

  const staleInvites = await env.DB.prepare(
    `SELECT a.id FROM chemistry_assessments a JOIN chemistry_invitations i ON i.assessment_id = a.id
       WHERE a.status = 'invited' AND i.expires_at <= ? LIMIT 20`,
  )
    .bind(now)
    .all<{ id: string }>();
  for (const row of staleInvites.results) await terminateAssessment(env, row.id, "expired", now);

  const staleReports = await env.DB.prepare(
    `SELECT id FROM chemistry_assessments
       WHERE status = 'released' AND report_expires_at IS NOT NULL AND report_expires_at <= ?
       LIMIT 20`,
  )
    .bind(now)
    .all<{ id: string }>();
  for (const row of staleReports.results) await terminateAssessment(env, row.id, "expired", now);

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM chemistry_pair_releases WHERE pair_key IN
        (SELECT pair_key FROM chemistry_pair_releases WHERE last_released_at <= ? LIMIT 100)`).bind(
      now - PAIR_COOLDOWN_SECONDS,
    ),
    env.DB.prepare(
      `DELETE FROM chemistry_assessments WHERE id IN (
           SELECT id FROM chemistry_assessments
           WHERE status IN ('declined','withdrawn','expired','deleted')
             AND purge_after IS NOT NULL AND purge_after <= ? LIMIT 20
         )`,
    ).bind(now),
    env.DB.prepare(
      `UPDATE chemistry_invitations SET state = 'expired'
         WHERE id IN (SELECT id FROM chemistry_invitations
                      WHERE state = 'pending' AND expires_at <= ? LIMIT 20)`,
    ).bind(now),
    env.DB.prepare(
      "DELETE FROM chemistry_budgets WHERE key IN (SELECT key FROM chemistry_budgets WHERE expires_at <= ? LIMIT 100)",
    ).bind(now),
  ]);
}

export async function ownAssessmentView(
  env: Bindings,
  assessment: AssessmentRow,
  participant: ParticipantRow,
  now: number,
): Promise<OwnAssessmentView> {
  const invitation =
    participant.role === "creator"
      ? await env.DB.prepare(
          "SELECT expires_at, state FROM chemistry_invitations WHERE assessment_id = ?",
        )
          .bind(assessment.id)
          .first<{ expires_at: number; state: InvitationRow["state"] }>()
      : null;
  const result = await env.DB.prepare(
    "SELECT result_epoch FROM chemistry_results WHERE assessment_id = ? AND result_epoch = ?",
  )
    .bind(assessment.id, assessment.result_epoch)
    .first<{ result_epoch: number }>();
  return {
    id: assessment.id,
    depth: assessment.depth as ChemistryDepth,
    manifestId: assessment.manifest_id,
    status: isTerminal(assessment.status)
      ? "closed"
      : assessment.status === "awaiting_release"
        ? "collecting"
        : assessment.status,
    createdAt: assessment.created_at,
    acceptedAt: assessment.accepted_at,
    assessmentExpiresAt: assessment.assessment_expires_at,
    reportExpiresAt: assessment.report_expires_at,
    role: participant.role,
    own: {
      submitted: participant.submission_revision !== null,
      submissionRevision: participant.submission_revision,
      draftRevision: participant.draft_revision,
    },
    invitation: invitation ? { expiresAt: invitation.expires_at, state: invitation.state } : null,
    reportAvailable:
      assessment.status === "released" &&
      assessment.report_expires_at !== null &&
      assessment.report_expires_at > now &&
      Boolean(result),
  };
}

export async function listOwnAssessments(
  env: Bindings,
  userId: string,
  now: number,
): Promise<OwnAssessmentView[]> {
  const { results } = await env.DB.prepare(
    `SELECT a.* FROM chemistry_assessments a
     JOIN chemistry_participants p ON p.assessment_id = a.id
     WHERE p.user_id = ?
     ORDER BY a.created_at DESC LIMIT 20`,
  )
    .bind(userId)
    .all<AssessmentRow>();
  const views: OwnAssessmentView[] = [];
  for (const assessment of results) {
    const participant = await env.DB.prepare(
      "SELECT * FROM chemistry_participants WHERE assessment_id = ? AND user_id = ?",
    )
      .bind(assessment.id, userId)
      .first<ParticipantRow>();
    if (participant) views.push(await ownAssessmentView(env, assessment, participant, now));
  }
  return views;
}

export interface CreatedAssessment {
  assessment: OwnAssessmentView;
  invitation: { token: string; expiresAt: number; inviteeLabel: string };
}

export async function createAssessment(
  env: Bindings,
  userId: string,
  depth: ChemistryDepth,
  inviteeLabel: string,
  now: number,
  sessionId?: string,
): Promise<CreatedAssessment | null> {
  const manifest = MANIFESTS[depth];
  if (!manifest) return null;
  if (!(await takeChemistryBudget(env, "invite-day", userId, DAILY_INVITATION_LIMIT, 86400)))
    return null;
  const active = await env.DB.prepare(
    `SELECT count(*) AS total FROM chemistry_invitations
     WHERE created_by = ? AND state = 'pending' AND expires_at > ?`,
  )
    .bind(userId, now)
    .first<{ total: number }>();
  if (!active || active.total >= ACTIVE_INVITATION_LIMIT) return null;

  const assessmentId = crypto.randomUUID();
  const invitationId = crypto.randomUUID();
  const label = inviteeLabel.trim().replace(/\s+/g, " ");
  if (label.length < 1 || label.length > 40) return null;
  const token = randomToken();
  const tokenDigest = await sha256Hex(`chemistry-invite-v1|${token}`);
  const expiresAt = now + INVITATION_TTL_SECONDS;
  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO chemistry_assessments
         (id, family, manifest_id, question_bank_version, algorithm_version, depth, status,
          created_by, created_at, invited_at)
         SELECT ?,?,?,?,?,?, 'invited', ?, ?, ? WHERE ${SESSION_STATE}`,
      ).bind(
        assessmentId,
        CHEMISTRY_FAMILY,
        manifest.id,
        CHEMISTRY_BANK_VERSION,
        CHEMISTRY_ALGORITHM_VERSION,
        depth,
        userId,
        now,
        now,
        ...sessionBindings(sessionId, userId, now),
      ),
      env.DB.prepare(
        "INSERT INTO chemistry_participants(assessment_id,user_id,slot,role,joined_at) VALUES (?,?,1,'creator',?)",
      ).bind(assessmentId, userId, now),
      env.DB.prepare(
        `INSERT INTO chemistry_invitations
         (id, assessment_id, token_digest, created_by, created_at, expires_at, state, invitee_label)
         VALUES (?,?,?,?,?,?, 'pending', ?)`,
      ).bind(invitationId, assessmentId, tokenDigest, userId, now, expiresAt, label),
    ]);
    if (results.some((result) => (result.meta.changes ?? 0) !== 1)) return null;
  } catch {
    return null;
  }
  const created = await assessmentAndParticipant(env, assessmentId, userId);
  if (!created) return null;
  return {
    assessment: await ownAssessmentView(env, created.assessment, created.participant, now),
    invitation: { token, expiresAt, inviteeLabel: label },
  };
}

export async function acceptInvitation(
  env: Bindings,
  token: string,
  confirmLabel: string,
  userId: string,
  now: number,
  sessionId?: string,
): Promise<{ assessmentId: string } | null> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  const digest = await sha256Hex(`chemistry-invite-v1|${token}`);
  const invitation = await env.DB.prepare(
    "SELECT * FROM chemistry_invitations WHERE token_digest = ?",
  )
    .bind(digest)
    .first<InvitationRow>();
  if (!invitation) return null;
  const assessment = await env.DB.prepare("SELECT * FROM chemistry_assessments WHERE id = ?")
    .bind(invitation.assessment_id)
    .first<AssessmentRow>();
  if (!assessment) return null;
  if (invitation.state !== "pending" || invitation.expires_at <= now) return null;
  const expected = invitation.invitee_label?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
  const confirmed = confirmLabel.trim().replace(/\s+/g, " ").toLowerCase();
  if (!expected || expected !== confirmed) return null;
  if (assessment.status !== "invited" || assessment.created_by === userId) return null;
  if (invitation.created_by === userId) return null;

  const pair = pairKey(assessment.created_by, userId);
  const cooldown = await env.DB.prepare(
    "SELECT last_released_at FROM chemistry_pair_releases WHERE pair_key = ?",
  )
    .bind(pair)
    .first<{ last_released_at: number }>();
  if (cooldown && cooldown.last_released_at + PAIR_COOLDOWN_SECONDS > now) return null;

  const acceptedAt = now;
  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        `UPDATE chemistry_invitations
         SET state = 'consumed', consumed_at = ?, consumed_by = ?
         WHERE id = ? AND state = 'pending' AND expires_at > ? AND created_by <> ?
           AND EXISTS (SELECT 1 FROM chemistry_assessments a WHERE a.id = assessment_id AND a.status = 'invited')
           AND NOT EXISTS (SELECT 1 FROM chemistry_pair_releases WHERE pair_key = ? AND last_released_at > ?)
           AND ${SESSION_STATE}`,
      ).bind(
        now,
        userId,
        invitation.id,
        now,
        userId,
        pair,
        now - PAIR_COOLDOWN_SECONDS,
        ...sessionBindings(sessionId, userId, now),
      ),
      env.DB.prepare(
        `INSERT INTO chemistry_participants(assessment_id,user_id,slot,role,joined_at)
         SELECT ?, ?, 2, 'invitee', ?
         WHERE EXISTS (
           SELECT 1 FROM chemistry_invitations
           WHERE id = ? AND state = 'consumed' AND consumed_by = ?
         )
         AND NOT EXISTS (
           SELECT 1 FROM chemistry_participants WHERE assessment_id = ? AND user_id = ?
         )`,
      ).bind(assessment.id, userId, now, invitation.id, userId, assessment.id, userId),
      env.DB.prepare(
        `UPDATE chemistry_assessments
         SET status = 'collecting', pair_key = ?, accepted_at = ?, assessment_expires_at = ?
         WHERE id = ? AND status = 'invited' AND created_by <> ?
           AND EXISTS (SELECT 1 FROM chemistry_participants WHERE assessment_id = ? AND user_id = ?)`,
      ).bind(
        pair,
        acceptedAt,
        assessmentExpiresAt(acceptedAt),
        assessment.id,
        userId,
        assessment.id,
        userId,
      ),
    ]);
    const changes = results.map((result) => result.meta.changes ?? 0);
    if (changes[0] !== 1 || changes[1] !== 1 || changes[2] !== 1) {
      return null;
    }
  } catch {
    return null;
  }
  return { assessmentId: assessment.id };
}

export async function declineAssessment(
  env: Bindings,
  assessmentId: string,
  userId: string,
  now: number,
): Promise<boolean> {
  const found = await assessmentAndParticipant(env, assessmentId, userId);
  if (!found || found.participant.role !== "invitee") return false;
  if (found.participant.submission_revision !== null) return false;
  return terminateAssessment(env, assessmentId, "declined", now);
}

export async function revokeInvitation(
  env: Bindings,
  assessmentId: string,
  userId: string,
  now: number,
): Promise<boolean> {
  const found = await assessmentAndParticipant(env, assessmentId, userId);
  if (!found || found.assessment.created_by !== userId) return false;
  if (found.assessment.status !== "invited") return false;
  const updated = await env.DB.prepare(
    `UPDATE chemistry_invitations SET state = 'revoked'
     WHERE assessment_id = ? AND state = 'pending' RETURNING id`,
  )
    .bind(assessmentId)
    .first();
  if (!updated) return false;
  return terminateAssessment(env, assessmentId, "withdrawn", now);
}

export async function saveDraft(
  env: Bindings,
  keyring: ChemistryKeyring,
  assessmentId: string,
  userId: string,
  submission: AssessmentSubmission,
  now: number,
  sessionId?: string,
): Promise<number | null> {
  const found = await assessmentAndParticipant(env, assessmentId, userId);
  if (!found) return null;
  const { assessment, participant } = found;
  if (!writableAssessment(assessment, now)) return null;
  if (participant.role === "invitee" && assessment.status === "invited") return null;
  if (submission.depth !== assessment.depth || submission.manifestId !== assessment.manifest_id)
    return null;
  if (submission.questionBankVersion !== assessment.question_bank_version) return null;

  const revision = participant.draft_revision + 1;
  if (revision > 1000) return null;
  let sealed: { envelope: string; keyVersion: number };
  try {
    sealed = await sealEnvelope(
      JSON.stringify(submission),
      draftAad({ assessmentId, userId, revision, manifestId: assessment.manifest_id }),
      keyring,
    );
  } catch {
    return null;
  }
  const invalidates = participant.submission_revision !== null;
  const guard =
    "EXISTS (SELECT 1 FROM chemistry_participants WHERE assessment_id = ? AND user_id = ? AND draft_revision = ? AND draft_envelope = ?)";
  const statements = [
    env.DB.prepare(
      `UPDATE chemistry_participants
       SET draft_revision = ?, draft_envelope = ?, draft_key_version = ?, draft_updated_at = ?
       WHERE assessment_id = ? AND user_id = ? AND draft_revision = ? AND submission_revision IS ? AND withdrawn_at IS NULL AND ${WRITE_STATE} AND ${SESSION_STATE}`,
    ).bind(
      revision,
      sealed.envelope,
      sealed.keyVersion,
      now,
      assessmentId,
      userId,
      participant.draft_revision,
      participant.submission_revision,
      assessment.result_epoch,
      Math.floor(Date.now() / 1000),
      Math.floor(Date.now() / 1000),
      ...sessionBindings(sessionId, userId, now),
    ),
  ];
  if (invalidates) {
    statements.push(
      env.DB.prepare(
        `UPDATE chemistry_assessments
         SET result_epoch = result_epoch + 1,
             status = CASE
               WHEN (SELECT count(*) FROM chemistry_participants WHERE assessment_id = ? AND submission_revision IS NOT NULL) = 2
               THEN 'awaiting_release' ELSE 'collecting' END
         WHERE id = ? AND status IN ('collecting','awaiting_release') AND ${guard}`,
      ).bind(assessmentId, assessmentId, assessmentId, userId, revision, sealed.envelope),
      env.DB.prepare(
        `DELETE FROM chemistry_release_approvals WHERE assessment_id = ? AND ${guard}`,
      ).bind(assessmentId, assessmentId, userId, revision, sealed.envelope),
      env.DB.prepare(`DELETE FROM chemistry_results WHERE assessment_id = ? AND ${guard}`).bind(
        assessmentId,
        assessmentId,
        userId,
        revision,
        sealed.envelope,
      ),
    );
  }
  try {
    const results = await env.DB.batch(statements);
    if ((results[0]?.meta.changes ?? 0) !== 1) return null;
  } catch {
    return null;
  }
  return revision;
}

export async function readDraft(
  env: Bindings,
  keyring: ChemistryKeyring,
  assessmentId: string,
  userId: string,
  sessionId?: string,
): Promise<AssessmentSubmission | null> {
  const found = await assessmentAndParticipant(env, assessmentId, userId);
  if (!found) return null;
  const { assessment, participant } = found;
  if (!participant.draft_envelope || !writableAssessment(assessment, Math.floor(Date.now() / 1000)))
    return null;
  try {
    const plaintext = await openEnvelope(
      participant.draft_envelope,
      draftAad({
        assessmentId,
        userId,
        revision: participant.draft_revision,
        manifestId: assessment.manifest_id,
      }),
      keyring,
      participant.draft_key_version,
    );
    const current = await env.DB.prepare(`SELECT p.user_id FROM chemistry_participants p
      JOIN chemistry_assessments a ON a.id = p.assessment_id
      WHERE a.id = ? AND p.user_id = ? AND p.draft_revision = ? AND p.draft_envelope = ?
        AND a.result_epoch = ? AND a.status IN ('invited','collecting','awaiting_release')
        AND a.terminated_at IS NULL AND p.withdrawn_at IS NULL
        AND (a.assessment_expires_at IS NULL OR a.assessment_expires_at > ?)
        AND (a.status <> 'invited' OR EXISTS (SELECT 1 FROM chemistry_invitations i
          WHERE i.assessment_id = a.id AND i.state = 'pending' AND i.expires_at > ?))
        AND EXISTS (SELECT 1 FROM account_declarations d WHERE d.user_id = p.user_id AND d.policy_version = ? AND d.expires_at > ?)
        AND ${SESSION_STATE}`)
      .bind(
        assessmentId,
        userId,
        participant.draft_revision,
        participant.draft_envelope,
        assessment.result_epoch,
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000),
        ADULT_POLICY,
        Math.floor(Date.now() / 1000),
        ...sessionBindings(sessionId, userId, Math.floor(Date.now() / 1000)),
      )
      .first();
    if (!current) return null;
    const payload: unknown = JSON.parse(plaintext);
    return parseSubmissionPayload(payload);
  } catch {
    return null;
  }
}

export async function submitAssessment(
  env: Bindings,
  keyring: ChemistryKeyring,
  assessmentId: string,
  userId: string,
  submission: AssessmentSubmission,
  now: number,
  sessionId?: string,
): Promise<number | null> {
  const found = await assessmentAndParticipant(env, assessmentId, userId);
  if (!found) return null;
  const { assessment, participant } = found;
  if (!writableAssessment(assessment, now)) return null;
  if (participant.role === "invitee" && assessment.status === "invited") return null;
  if (submission.depth !== assessment.depth || submission.manifestId !== assessment.manifest_id)
    return null;
  if (submission.questionBankVersion !== assessment.question_bank_version) return null;

  const revision = Math.max(participant.draft_revision, participant.submission_revision ?? 0) + 1;
  if (revision > 1000) return null;
  let sealed: { envelope: string; keyVersion: number };
  let sealedDraft: { envelope: string; keyVersion: number };
  try {
    sealed = await sealEnvelope(
      JSON.stringify(submission),
      submissionAad({ assessmentId, userId, revision, manifestId: assessment.manifest_id }),
      keyring,
    );
    sealedDraft = await sealEnvelope(
      JSON.stringify(submission),
      draftAad({ assessmentId, userId, revision, manifestId: assessment.manifest_id }),
      keyring,
    );
  } catch {
    return null;
  }
  const digest = await sha256Hex(sealed.envelope);
  const guard =
    "EXISTS (SELECT 1 FROM chemistry_participants WHERE assessment_id = ? AND user_id = ? AND submission_revision = ? AND submission_digest = ?)";
  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        `UPDATE chemistry_participants
         SET submission_revision = ?, submitted_at = ?, submission_envelope = ?,
             submission_key_version = ?, submission_digest = ?, draft_revision = ?,
             draft_envelope = ?, draft_key_version = ?, draft_updated_at = ?
         WHERE assessment_id = ? AND user_id = ?
           AND submission_revision IS ? AND draft_revision = ? AND withdrawn_at IS NULL AND ${WRITE_STATE} AND ${SESSION_STATE}`,
      ).bind(
        revision,
        now,
        sealed.envelope,
        sealed.keyVersion,
        digest,
        revision,
        sealedDraft.envelope,
        sealedDraft.keyVersion,
        now,
        assessmentId,
        userId,
        participant.submission_revision,
        participant.draft_revision,
        assessment.result_epoch,
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000),
        ...sessionBindings(sessionId, userId, now),
      ),
      env.DB.prepare(
        `UPDATE chemistry_assessments
         SET result_epoch = result_epoch + 1,
             status = CASE
               WHEN (SELECT count(*) FROM chemistry_participants WHERE assessment_id = ? AND submission_revision IS NOT NULL) = 2
               THEN 'awaiting_release' ELSE 'collecting' END
         WHERE id = ? AND status IN ('invited','collecting','awaiting_release') AND ${guard}`,
      ).bind(assessmentId, assessmentId, assessmentId, userId, revision, digest),
      env.DB.prepare(
        `DELETE FROM chemistry_release_approvals WHERE assessment_id = ? AND ${guard}`,
      ).bind(assessmentId, assessmentId, userId, revision, digest),
      env.DB.prepare(`DELETE FROM chemistry_results WHERE assessment_id = ? AND ${guard}`).bind(
        assessmentId,
        assessmentId,
        userId,
        revision,
        digest,
      ),
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1) return null;
  } catch {
    return null;
  }
  return revision;
}

export interface ApprovalInput {
  dimensions: readonly string[];
  intimacyShared: boolean;
  hardSignal: boolean;
}

export async function approveRelease(
  env: Bindings,
  assessmentId: string,
  userId: string,
  input: ApprovalInput,
  now: number,
  sessionId?: string,
): Promise<OwnAssessmentView | null> {
  const found = await assessmentAndParticipant(env, assessmentId, userId);
  if (!found) return null;
  const { assessment, participant } = found;
  if (
    !["collecting", "awaiting_release"].includes(assessment.status) ||
    assessment.accepted_at === null
  )
    return null;
  if (
    assessment.algorithm_version !== CHEMISTRY_ALGORITHM_VERSION ||
    assessment.question_bank_version !== CHEMISTRY_BANK_VERSION
  )
    return null;
  if (assessment.assessment_expires_at !== null && assessment.assessment_expires_at <= now)
    return null;
  if (participant.submission_revision === null) return null;
  const scope = normalizeScope({
    dimensions: input.dimensions,
    intimacyShared: input.intimacyShared,
    hardSignal: input.hardSignal,
    expiresAt: reportExpiresAt(assessment.accepted_at),
  });
  if (!scope) return null;
  const digest = await sha256Hex(
    scopeMaterial({
      assessmentId,
      resultEpoch: assessment.result_epoch,
      submissionRevision: participant.submission_revision,
      manifestId: assessment.manifest_id,
      scope,
    }),
  );
  const scopeJson = JSON.stringify({
    dimensions: scope.dimensions,
    intimacyShared: scope.intimacyShared,
    hardSignal: scope.hardSignal,
    expiresAt: scope.expiresAt,
  });
  try {
    const result = await env.DB.prepare(
      `INSERT INTO chemistry_release_approvals
       (assessment_id,user_id,result_epoch,submission_revision,manifest_id,scope_digest,scope_json,approved_at,expires_at)
       SELECT ?,?,?,?,?,?,?,?,?
       WHERE EXISTS (SELECT 1 FROM chemistry_assessments a JOIN chemistry_participants p ON p.assessment_id = a.id
         WHERE a.id = ? AND p.user_id = ? AND a.result_epoch = ? AND a.status IN ('collecting','awaiting_release')
           AND a.terminated_at IS NULL AND a.assessment_expires_at > ? AND p.withdrawn_at IS NULL
           AND p.submission_revision = ? AND p.draft_revision = p.submission_revision)
       AND ${SESSION_STATE}
       ON CONFLICT(assessment_id,user_id,result_epoch) DO UPDATE SET
         submission_revision=excluded.submission_revision,
         manifest_id=excluded.manifest_id,
         scope_digest=excluded.scope_digest,
         scope_json=excluded.scope_json,
         approved_at=excluded.approved_at,
         expires_at=excluded.expires_at`,
    )
      .bind(
        assessmentId,
        userId,
        assessment.result_epoch,
        participant.submission_revision,
        assessment.manifest_id,
        digest,
        scopeJson,
        now,
        scope.expiresAt,
        assessmentId,
        userId,
        assessment.result_epoch,
        Math.floor(Date.now() / 1000),
        participant.submission_revision,
        ...sessionBindings(sessionId, userId, now),
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1) return null;
  } catch {
    return null;
  }
  const refreshed = await assessmentAndParticipant(env, assessmentId, userId);
  if (!refreshed) return null;
  return ownAssessmentView(env, refreshed.assessment, refreshed.participant, now);
}

function parseStoredScope(row: ApprovalRow): ReleaseScope | null {
  try {
    const value = JSON.parse(row.scope_json) as Record<string, unknown>;
    if (!Array.isArray(value.dimensions)) return null;
    return normalizeScope({
      dimensions: value.dimensions.filter((entry): entry is string => typeof entry === "string"),
      intimacyShared: value.intimacyShared === true,
      hardSignal: value.hardSignal === true,
      expiresAt: typeof value.expiresAt === "number" ? value.expiresAt : 0,
    });
  } catch {
    return null;
  }
}

async function decryptedSubmission(
  keyring: ChemistryKeyring,
  assessment: AssessmentRow,
  participant: ParticipantRow,
): Promise<AssessmentSubmission | null> {
  if (!participant.submission_envelope || participant.submission_revision === null) return null;
  try {
    const plaintext = await openEnvelope(
      participant.submission_envelope,
      submissionAad({
        assessmentId: assessment.id,
        userId: participant.user_id,
        revision: participant.submission_revision,
        manifestId: assessment.manifest_id,
      }),
      keyring,
      participant.submission_key_version,
    );
    const payload: unknown = JSON.parse(plaintext);
    const submission = parseSubmissionPayload(payload);
    if (!submission) return null;
    if (submission.depth !== assessment.depth || submission.manifestId !== assessment.manifest_id)
      return null;
    return submission;
  } catch {
    return null;
  }
}

export interface ReleasedReport {
  report: SharedReport;
  expiresAt: number;
}

export async function releaseAssessment(
  env: Bindings,
  keyring: ChemistryKeyring,
  assessmentId: string,
  userId: string,
  now: number,
  sessionId?: string,
): Promise<ReleasedReport | null> {
  const found = await assessmentAndParticipant(env, assessmentId, userId);
  if (!found) return null;
  const { assessment } = found;
  if (assessment.status !== "awaiting_release" || assessment.accepted_at === null) return null;
  if (
    assessment.algorithm_version !== CHEMISTRY_ALGORITHM_VERSION ||
    assessment.question_bank_version !== CHEMISTRY_BANK_VERSION
  )
    return null;
  if (assessment.assessment_expires_at !== null && assessment.assessment_expires_at <= now)
    return null;

  const participants = await env.DB.prepare(
    "SELECT * FROM chemistry_participants WHERE assessment_id = ? ORDER BY slot",
  )
    .bind(assessmentId)
    .all<ParticipantRow>();
  if (participants.results.length !== 2) return null;
  if (
    participants.results.some(
      (participant) =>
        participant.submission_revision === null ||
        participant.submission_envelope === null ||
        participant.withdrawn_at !== null,
    )
  )
    return null;

  const approvals = await env.DB.prepare(
    "SELECT * FROM chemistry_release_approvals WHERE assessment_id = ? AND result_epoch = ?",
  )
    .bind(assessmentId, assessment.result_epoch)
    .all<ApprovalRow>();
  if (approvals.results.length !== 2) return null;
  const approvalByUser = new Map(approvals.results.map((row) => [row.user_id, row]));
  const deadline = reportExpiresAt(assessment.accepted_at);
  const scopes: ReleaseScope[] = [];
  for (const participant of participants.results) {
    const approval = approvalByUser.get(participant.user_id);
    if (!approval) return null;
    if (approval.submission_revision !== participant.submission_revision) return null;
    if (approval.manifest_id !== assessment.manifest_id) return null;
    const scope = parseStoredScope(approval);
    if (!scope || scope.expiresAt !== deadline || approval.expires_at !== deadline) return null;
    const expected = await sha256Hex(
      scopeMaterial({
        assessmentId,
        resultEpoch: assessment.result_epoch,
        submissionRevision: participant.submission_revision,
        manifestId: assessment.manifest_id,
        scope,
      }),
    );
    if (expected !== approval.scope_digest) return null;
    scopes.push(scope);
  }
  const firstScope = scopes[0];
  const secondScope = scopes[1];
  if (!firstScope || !secondScope) return null;
  const shared = intersectScopes(firstScope, secondScope);
  if (!shared || shared.expiresAt !== deadline) return null;

  if (assessment.pair_key) {
    const ledger = await env.DB.prepare(
      "SELECT last_released_at FROM chemistry_pair_releases WHERE pair_key = ?",
    )
      .bind(assessment.pair_key)
      .first<{ last_released_at: number }>();
    if (ledger && ledger.last_released_at + PAIR_COOLDOWN_SECONDS > now) return null;
  }

  const firstParticipant = participants.results[0];
  const secondParticipant = participants.results[1];
  if (!firstParticipant || !secondParticipant) return null;
  const firstSubmission = await decryptedSubmission(keyring, assessment, firstParticipant);
  const secondSubmission = await decryptedSubmission(keyring, assessment, secondParticipant);
  if (!firstSubmission || !secondSubmission) return null;

  // Approval flags are authoritative for release; submitted preferences are not.
  firstSubmission.hardSignal = shared.hardSignal;
  firstSubmission.intimacyShared = shared.intimacyShared;
  secondSubmission.hardSignal = shared.hardSignal;
  secondSubmission.intimacyShared = shared.intimacyShared;
  const evaluation = evaluateCompatibility(firstSubmission, secondSubmission, {
    dimensions: shared.dimensions,
  });
  const builtReport = buildSharedReport(evaluation);
  const report: SharedReport = {
    ...builtReport,
    dimensions: builtReport.dimensions.map((dimension) =>
      dimension.band === null && builtReport.available
        ? { ...dimension, detail: "not_enough_shared_answers" }
        : dimension,
    ),
  };

  const sharedDigest = await sha256Hex(
    JSON.stringify({
      v: 1,
      assessmentId,
      resultEpoch: assessment.result_epoch,
      revisions: participants.results
        .map((participant) => participant.submission_revision)
        .sort((left, right) => (left ?? 0) - (right ?? 0)),
      manifestId: assessment.manifest_id,
      scope: shared,
    }),
  );

  let sealedReport: { envelope: string; keyVersion: number };
  try {
    sealedReport = await sealEnvelope(
      JSON.stringify(report),
      reportAad({
        assessmentId,
        resultEpoch: assessment.result_epoch,
        sharedDigest,
      }),
      keyring,
    );
  } catch {
    return null;
  }

  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO chemistry_results
         (assessment_id,result_epoch,report_envelope,envelope_key_version,scope_digest,created_at,expires_at)
         SELECT ?,?,?,?,?,?,?
         WHERE NOT EXISTS (SELECT 1 FROM chemistry_results WHERE assessment_id = ?)
           AND EXISTS (SELECT 1 FROM chemistry_assessments a WHERE a.id = ?
             AND a.status = 'awaiting_release' AND a.result_epoch = ? AND a.terminated_at IS NULL
             AND a.assessment_expires_at > ? AND a.manifest_id = ? AND a.algorithm_version = ?)
           AND (SELECT count(*) FROM chemistry_participants p JOIN chemistry_release_approvals r
             ON r.assessment_id = p.assessment_id AND r.user_id = p.user_id
             JOIN users u ON u.id = p.user_id JOIN account_declarations d ON d.user_id = p.user_id
             WHERE p.assessment_id = ? AND p.withdrawn_at IS NULL AND u.deletion_requested_at IS NULL
               AND d.policy_version = ? AND d.expires_at > ?
               AND p.draft_revision = p.submission_revision
               AND r.result_epoch = ? AND r.submission_revision = p.submission_revision
               AND r.manifest_id = ? AND r.expires_at = ?
               AND ((p.user_id = ? AND p.submission_digest = ? AND r.scope_digest = ?)
                 OR (p.user_id = ? AND p.submission_digest = ? AND r.scope_digest = ?))) = 2
           AND ${SESSION_STATE}`,
      ).bind(
        assessmentId,
        assessment.result_epoch,
        sealedReport.envelope,
        sealedReport.keyVersion,
        sharedDigest,
        now,
        shared.expiresAt,
        assessmentId,
        assessmentId,
        assessment.result_epoch,
        Math.floor(Date.now() / 1000),
        assessment.manifest_id,
        CHEMISTRY_ALGORITHM_VERSION,
        assessmentId,
        ADULT_POLICY,
        now,
        assessment.result_epoch,
        assessment.manifest_id,
        deadline,
        firstParticipant.user_id,
        firstParticipant.submission_digest,
        approvalByUser.get(firstParticipant.user_id)?.scope_digest ?? "",
        secondParticipant.user_id,
        secondParticipant.submission_digest,
        approvalByUser.get(secondParticipant.user_id)?.scope_digest ?? "",
        ...sessionBindings(sessionId, userId, now),
      ),
      env.DB.prepare(
        `UPDATE chemistry_assessments
         SET status = 'released', released_at = ?, report_expires_at = ?
         WHERE id = ? AND status = 'awaiting_release' AND result_epoch = ?
           AND EXISTS (SELECT 1 FROM chemistry_results WHERE assessment_id = ? AND result_epoch = ?)`,
      ).bind(
        now,
        shared.expiresAt,
        assessmentId,
        assessment.result_epoch,
        assessmentId,
        assessment.result_epoch,
      ),
      env.DB.prepare(
        `INSERT INTO chemistry_pair_releases(pair_key,family,last_released_at)
         SELECT pair_key, family, ? FROM chemistry_assessments
         WHERE id = ? AND status = 'released' AND released_at = ?
         ON CONFLICT(pair_key) DO UPDATE SET last_released_at=excluded.last_released_at`,
      ).bind(now, assessmentId, now),
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1) {
      return null;
    }
  } catch {
    return null;
  }
  return readReleasedReport(
    env,
    keyring,
    assessmentId,
    userId,
    Math.floor(Date.now() / 1000),
    sessionId,
  );
}

export async function readReleasedReport(
  env: Bindings,
  keyring: ChemistryKeyring,
  assessmentId: string,
  userId: string,
  now: number,
  sessionId?: string,
): Promise<ReleasedReport | null> {
  const found = await assessmentAndParticipant(env, assessmentId, userId);
  if (!found) return null;
  const { assessment } = found;
  if (assessment.status !== "released" || assessment.report_expires_at === null) return null;
  if (assessment.report_expires_at <= now) {
    await terminateAssessment(env, assessmentId, "expired", now);
    return null;
  }
  const participants = await env.DB.prepare(
    "SELECT count(*) AS total FROM chemistry_participants WHERE assessment_id = ? AND withdrawn_at IS NULL",
  )
    .bind(assessmentId)
    .first<{ total: number }>();
  if (!participants || participants.total !== 2) return null;
  const result = await env.DB.prepare(
    "SELECT result_epoch, report_envelope, envelope_key_version, scope_digest, expires_at FROM chemistry_results WHERE assessment_id = ?",
  )
    .bind(assessmentId)
    .first<{
      result_epoch: number;
      report_envelope: string;
      envelope_key_version: number;
      scope_digest: string;
      expires_at: number;
    }>();
  if (!result || result.result_epoch !== assessment.result_epoch) return null;
  if (result.expires_at <= now) return null;
  try {
    const plaintext = await openEnvelope(
      result.report_envelope,
      reportAad({
        assessmentId,
        resultEpoch: result.result_epoch,
        sharedDigest: result.scope_digest,
      }),
      keyring,
      result.envelope_key_version,
    );
    const report = JSON.parse(plaintext) as SharedReport;
    if (report.version !== 1 || report.manifestId !== assessment.manifest_id) return null;
    // Linearization point after crypto: revocations completed during decryption win.
    const current = await env.DB.prepare(`SELECT a.id FROM chemistry_assessments a
      JOIN chemistry_results r ON r.assessment_id = a.id AND r.result_epoch = a.result_epoch
      WHERE a.id = ? AND a.status = 'released' AND a.terminated_at IS NULL AND a.result_epoch = ?
        AND a.report_expires_at > ? AND r.expires_at > ? AND r.report_envelope = ?
        AND a.algorithm_version = ? AND a.question_bank_version = ?
        AND EXISTS (SELECT 1 FROM chemistry_participants WHERE assessment_id = a.id AND user_id = ? AND withdrawn_at IS NULL)
        AND (SELECT count(*) FROM chemistry_participants p
          JOIN users u ON u.id = p.user_id JOIN account_declarations d ON d.user_id = p.user_id
          JOIN chemistry_release_approvals g ON g.assessment_id = p.assessment_id AND g.user_id = p.user_id
          WHERE p.assessment_id = a.id AND p.withdrawn_at IS NULL AND u.deletion_requested_at IS NULL
            AND d.policy_version = ? AND d.expires_at > ? AND g.result_epoch = a.result_epoch
            AND g.submission_revision = p.submission_revision AND g.manifest_id = a.manifest_id
            AND g.expires_at = r.expires_at) = 2 AND ${SESSION_STATE}`)
      .bind(
        assessmentId,
        assessment.result_epoch,
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000),
        result.report_envelope,
        CHEMISTRY_ALGORITHM_VERSION,
        CHEMISTRY_BANK_VERSION,
        userId,
        ADULT_POLICY,
        Math.floor(Date.now() / 1000),
        ...sessionBindings(sessionId, userId, Math.floor(Date.now() / 1000)),
      )
      .first();
    if (!current) return null;
    return { report, expiresAt: result.expires_at };
  } catch {
    return null;
  }
}

export async function withdrawAssessment(
  env: Bindings,
  assessmentId: string,
  userId: string,
  now: number,
  mode: "withdrawn" | "deleted" = "withdrawn",
): Promise<boolean> {
  const found = await assessmentAndParticipant(env, assessmentId, userId);
  if (!found) return false;
  if (isTerminal(found.assessment.status)) return true;
  return terminateAssessment(env, assessmentId, mode, now);
}
