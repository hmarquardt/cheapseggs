-- C1.1 Chemistry Check private assessment foundation.
-- No couple rows, no membership, no automatic relationship. Two independent user IDs are
-- bound through an assessment-scoped invitation. Private responses and reports are stored
-- only as authenticated encrypted envelopes; there is no plaintext answer column.
PRAGMA foreign_keys = ON;

CREATE TABLE chemistry_assessments (
  id TEXT PRIMARY KEY,
  family TEXT NOT NULL,
  manifest_id TEXT NOT NULL,
  question_bank_version TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  depth INTEGER NOT NULL CHECK (depth IN (25, 50, 100)),
  status TEXT NOT NULL CHECK (
    status IN ('draft','invited','collecting','awaiting_release','released',
               'declined','withdrawn','expired','deleted')
  ),
  result_epoch INTEGER NOT NULL DEFAULT 1 CHECK (result_epoch > 0),
  pair_key TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  invited_at INTEGER,
  accepted_at INTEGER,
  assessment_expires_at INTEGER,
  released_at INTEGER,
  report_expires_at INTEGER,
  terminated_at INTEGER,
  purge_after INTEGER,
  CHECK (pair_key IS NULL OR length(pair_key) BETWEEN 3 AND 300),
  CHECK (status NOT IN ('collecting','awaiting_release','released') OR pair_key IS NOT NULL),
  CHECK (assessment_expires_at IS NULL OR assessment_expires_at > created_at),
  CHECK (report_expires_at IS NULL OR released_at IS NULL OR report_expires_at > released_at)
) STRICT;

CREATE INDEX chemistry_assessments_creator
  ON chemistry_assessments(created_by, created_at DESC);
CREATE INDEX chemistry_assessments_purge ON chemistry_assessments(purge_after);
-- One live assessment per unordered pair and question-bank family.
CREATE UNIQUE INDEX chemistry_assessments_live_pair ON chemistry_assessments(pair_key)
  WHERE pair_key IS NOT NULL AND status IN ('collecting','awaiting_release','released');

CREATE TABLE chemistry_participants (
  assessment_id TEXT NOT NULL REFERENCES chemistry_assessments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot IN (1, 2)),
  role TEXT NOT NULL CHECK (role IN ('creator','invitee')),
  joined_at INTEGER NOT NULL,
  draft_revision INTEGER NOT NULL DEFAULT 0 CHECK (draft_revision >= 0),
  draft_envelope TEXT,
  draft_key_version INTEGER,
  draft_updated_at INTEGER,
  submission_revision INTEGER CHECK (submission_revision IS NULL OR submission_revision > 0),
  submitted_at INTEGER,
  submission_envelope TEXT,
  submission_key_version INTEGER,
  submission_digest TEXT CHECK (submission_digest IS NULL OR length(submission_digest) = 64),
  withdrawn_at INTEGER,
  PRIMARY KEY (assessment_id, user_id),
  UNIQUE (assessment_id, slot),
  CHECK ((role = 'creator' AND slot = 1) OR (role = 'invitee' AND slot = 2)),
  CHECK ((submission_revision IS NULL) = (submitted_at IS NULL)),
  CHECK ((submission_envelope IS NULL) = (submission_key_version IS NULL)),
  CHECK ((draft_envelope IS NULL) = (draft_key_version IS NULL))
) STRICT;

CREATE INDEX chemistry_participants_user ON chemistry_participants(user_id, joined_at DESC);

CREATE TRIGGER chemistry_participant_identity_immutable
BEFORE UPDATE OF assessment_id, user_id, slot, role ON chemistry_participants
BEGIN
  SELECT RAISE(ABORT, 'participant identity is immutable');
END;

CREATE TRIGGER chemistry_participant_submission_monotonic
BEFORE UPDATE OF submission_revision ON chemistry_participants
WHEN NEW.submission_revision IS NOT NULL
 AND OLD.submission_revision IS NOT NULL
 AND NEW.submission_revision <= OLD.submission_revision
BEGIN
  SELECT RAISE(ABORT, 'submission revision must advance');
END;

CREATE TRIGGER chemistry_participant_draft_monotonic
BEFORE UPDATE OF draft_revision ON chemistry_participants
WHEN NEW.draft_revision < OLD.draft_revision
BEGIN
  SELECT RAISE(ABORT, 'draft revision must not go backwards');
END;


CREATE TABLE chemistry_invitations (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL UNIQUE REFERENCES chemistry_assessments(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','consumed','revoked','expired')),
  consumed_at INTEGER,
  consumed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  CHECK (expires_at > created_at),
  CHECK ((state = 'consumed') = (consumed_at IS NOT NULL)),
  CHECK ((state = 'consumed') = (consumed_by IS NOT NULL))
) STRICT;

CREATE INDEX chemistry_invitations_creator
  ON chemistry_invitations(created_by, state, expires_at);

CREATE TRIGGER chemistry_invitation_token_immutable
BEFORE UPDATE OF token_digest, assessment_id ON chemistry_invitations
BEGIN
  SELECT RAISE(ABORT, 'invitation capability is immutable');
END;

CREATE TRIGGER chemistry_invitation_terminal
BEFORE UPDATE OF state ON chemistry_invitations
WHEN OLD.state <> 'pending' AND NEW.state <> OLD.state
BEGIN
  SELECT RAISE(ABORT, 'invitation already resolved');
END;

CREATE TABLE chemistry_release_approvals (
  assessment_id TEXT NOT NULL REFERENCES chemistry_assessments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  result_epoch INTEGER NOT NULL CHECK (result_epoch > 0),
  submission_revision INTEGER NOT NULL CHECK (submission_revision > 0),
  manifest_id TEXT NOT NULL,
  scope_digest TEXT NOT NULL CHECK (length(scope_digest) = 64),
  scope_json TEXT NOT NULL CHECK (length(scope_json) BETWEEN 2 AND 2048),
  approved_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (assessment_id, user_id, result_epoch)
) STRICT;

CREATE TABLE chemistry_results (
  assessment_id TEXT PRIMARY KEY REFERENCES chemistry_assessments(id) ON DELETE CASCADE,
  result_epoch INTEGER NOT NULL,
  report_envelope TEXT NOT NULL,
  envelope_key_version INTEGER NOT NULL,
  scope_digest TEXT NOT NULL CHECK (length(scope_digest) = 64),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE (assessment_id, result_epoch),
  CHECK (expires_at > created_at)
) STRICT;

CREATE TRIGGER chemistry_result_epoch_guard
BEFORE INSERT ON chemistry_results
WHEN NOT EXISTS (
  SELECT 1 FROM chemistry_assessments
  WHERE id = NEW.assessment_id
    AND result_epoch = NEW.result_epoch
    AND status = 'awaiting_release'
    AND terminated_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'result does not match a releasable assessment');
END;

CREATE TABLE chemistry_pair_releases (
  pair_key TEXT PRIMARY KEY,
  family TEXT NOT NULL,
  last_released_at INTEGER NOT NULL
) STRICT;

CREATE TABLE chemistry_budgets (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK (count > 0),
  expires_at INTEGER NOT NULL
) STRICT;

CREATE INDEX chemistry_budgets_expiry ON chemistry_budgets(expires_at);

-- Deleting either account removes the assessment and every private envelope immediately.
-- The independent pair-release ledger deliberately survives, so the cooldown cannot be
-- reset by deleting an account.
CREATE TRIGGER chemistry_account_delete
BEFORE DELETE ON users
BEGIN
  DELETE FROM chemistry_assessments
  WHERE created_by = OLD.id
     OR id IN (SELECT assessment_id FROM chemistry_participants WHERE user_id = OLD.id);
END;
