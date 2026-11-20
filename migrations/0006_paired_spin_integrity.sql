-- M3B independent review: give companion references the same FK protection as winners.
-- No table references guest_spins. Copy before dropping; any invalid legacy reference
-- aborts the migration instead of discarding data. Withdrawal remains possible and
-- the API revalidates it on replay. No auth or account tables are changed.
PRAGMA foreign_keys = ON;

CREATE TABLE guest_spins_checked (
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
  companion_activity_id TEXT,
  companion_activity_version INTEGER,
  FOREIGN KEY (wheel_id, wheel_version) REFERENCES wheels(id, version) ON DELETE RESTRICT,
  FOREIGN KEY (activity_id, activity_version)
    REFERENCES activity_versions(activity_id, version) ON DELETE RESTRICT,
  FOREIGN KEY (companion_activity_id, companion_activity_version)
    REFERENCES activity_versions(activity_id, version) ON DELETE RESTRICT,
  CHECK ((companion_activity_id IS NULL) = (companion_activity_version IS NULL)),
  CHECK (expires_at > created_at)
) STRICT;
INSERT INTO guest_spins_checked SELECT
  id, session_id, request_digest, wheel_id, wheel_version, activity_id, activity_version,
  catalog_revision, created_at, expires_at, companion_activity_id, companion_activity_version
FROM guest_spins;
DROP TABLE guest_spins;
ALTER TABLE guest_spins_checked RENAME TO guest_spins;
CREATE INDEX guest_spins_session ON guest_spins(session_id, created_at);
CREATE INDEX guest_spins_expiry ON guest_spins(expires_at);
CREATE INDEX guest_spins_companion ON guest_spins(companion_activity_id, companion_activity_version);

CREATE TRIGGER guest_spins_companion_exists_insert BEFORE INSERT ON guest_spins
WHEN NEW.companion_activity_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM activity_versions
  WHERE activity_id = NEW.companion_activity_id AND version = NEW.companion_activity_version
    AND access_tier = 'public_preview' AND status = 'published'
)
BEGIN
  SELECT RAISE(ABORT, 'companion must be a published public activity version');
END;
CREATE TRIGGER guest_spins_companion_exists_update
BEFORE UPDATE OF companion_activity_id, companion_activity_version ON guest_spins
WHEN NEW.companion_activity_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM activity_versions
  WHERE activity_id = NEW.companion_activity_id AND version = NEW.companion_activity_version
    AND access_tier = 'public_preview' AND status = 'published'
)
BEGIN
  SELECT RAISE(ABORT, 'companion must be a published public activity version');
END;
