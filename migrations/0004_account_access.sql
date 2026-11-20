-- Domain lifecycle is separate from framework identity; triggers keep creation/deletion atomic.
CREATE TABLE account_deletions (
  subject_id TEXT PRIMARY KEY,
  deleted_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE TRIGGER auth_domain_create AFTER INSERT ON auth_user BEGIN
  INSERT INTO users(id,auth_subject) VALUES (NEW.id,NEW.id);
END;
CREATE TRIGGER auth_domain_delete BEFORE DELETE ON auth_user BEGIN
  INSERT OR IGNORE INTO account_deletions(subject_id) VALUES (OLD.id);
  DELETE FROM auth_verification WHERE identifier = 'sign-in-otp-' || OLD.email;
  DELETE FROM users WHERE auth_subject = OLD.id;
END;
CREATE TABLE account_declarations (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL,
  declared_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at > declared_at)
) STRICT;
CREATE TABLE account_category_approvals (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL,
  approved_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,category_id)
) STRICT;
CREATE TABLE auth_budgets (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX auth_budgets_expiry ON auth_budgets(expires_at);
CREATE INDEX auth_verification_expiry ON auth_verification(expiresAt);
ALTER TABLE activity_versions ADD COLUMN access_tier TEXT NOT NULL DEFAULT 'restricted'
  CHECK(access_tier IN ('public_preview','registered_adult','verified_adult','restricted'));

-- Explicitly grandfather the 44 reviewed M2 versions; heat is never an access classification.
UPDATE activity_versions SET access_tier = 'public_preview' WHERE (activity_id,version) IN (('uninterrupted-attention',1),('compliments',1),('appreciation-inventory',1),('one-bold-question',1),('the-honest-answer',1),('the-ten-year-postcard',1),('say-it-in-writing',1),('playlist',1),('two-truths-one-flirt',1),('the-coin-says-so',1),('worst-idea-contest',1),('free-pass-tokens',1),('the-mystery-envelope',1),('twenty-questions-flirty',1),('change-the-lighting',1),('phones-in-the-drawer',1),('midnight-snack-plate',1),('the-arrival-ritual',1),('set-the-scene-in-five',1),('hotel-room-ritual',1),('slow-dance',1),('kitchen-sway',1),('the-two-song-stretch',1),('hallway-runway',1),('eleven-minute-shuffle',1),('hand-massage',1),('the-long-hug',1),('shoulder-and-scalp',1),('blanket-burrito',1),('trace-a-line',1),('face-hold',1),('blind-taste-test',1),('the-scent-memory',1),('temperature-play',1),('low-light-silhouette',1),('the-sound-map',1),('the-alter-ego-intro',1),('the-imaginary-getaway',1),('scene-in-three-sentences',1),('the-movie-pitch',1),('future-flirt',1),('one-thing-that-worked',1),('water-and-blanket',1),('the-goodnight-sentence',1));

CREATE TABLE auth_email_volume (
  period TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK(count > 0)
) STRICT;
