-- M2: guest Discovery Mode wheel. Append-only; reviewed with the M2 route contract.
--
-- Privacy boundary: these rows exist only for idempotent replay of one spin and for
-- per-session variety. They store NO visitor boundaries (heat, exclusions, opt-ins,
-- supplies) and no answers — only a SHA-256 digest of the normalized request so a
-- changed request cannot reuse an earlier result. Guest state expires after 24h and
-- is purged in bounded batches on later requests; an explicit reset deletes it.
PRAGMA foreign_keys = ON;

CREATE TABLE guest_sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  CHECK (expires_at > created_at)
) STRICT;
CREATE INDEX guest_sessions_expiry ON guest_sessions(expires_at);

CREATE TABLE guest_spins (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES guest_sessions(id) ON DELETE CASCADE,
  request_digest TEXT NOT NULL CHECK (length(request_digest) = 64),
  wheel_id TEXT NOT NULL,
  wheel_version INTEGER NOT NULL,
  activity_id TEXT NOT NULL,
  activity_version INTEGER NOT NULL,
  catalog_revision TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (wheel_id, wheel_version) REFERENCES wheels(id, version) ON DELETE RESTRICT,
  FOREIGN KEY (activity_id, activity_version)
    REFERENCES activity_versions(activity_id, version) ON DELETE RESTRICT,
  CHECK (expires_at > created_at)
) STRICT;
CREATE INDEX guest_spins_session ON guest_spins(session_id, created_at);
CREATE INDEX guest_spins_expiry ON guest_spins(expires_at);
