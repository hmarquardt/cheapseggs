-- Append-only migrations. Auth framework tables are generated in M1b, never hand-invented.
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  auth_subject TEXT UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  deletion_requested_at INTEGER
) STRICT;

CREATE TABLE adult_access (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL,
  assurance_method TEXT NOT NULL,
  jurisdiction_policy TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > verified_at)
) STRICT;

CREATE TABLE couples (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending','active','dissolved')),
  consent_epoch INTEGER NOT NULL DEFAULT 1 CHECK (consent_epoch > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  dissolved_at INTEGER
) STRICT;
CREATE TABLE memberships (
  couple_id TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot IN (1,2)),
  state TEXT NOT NULL CHECK (state IN ('active','revoked')),
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (couple_id, user_id),
  UNIQUE (couple_id, slot)
) STRICT;
CREATE INDEX memberships_user ON memberships(user_id, state);
CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  couple_id TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('pending','accepted','rejected','revoked')),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE UNIQUE INDEX one_pending_invite ON invitations(couple_id) WHERE state = 'pending';
CREATE INDEX invitations_expiry ON invitations(expires_at);

CREATE TABLE content_packs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','published','withdrawn'))
) STRICT;
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  required_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (required_opt_in IN (0,1))
) STRICT;
CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE TABLE activity_versions (
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  heat INTEGER NOT NULL CHECK (heat BETWEEN 0 AND 3),
  experimentation INTEGER NOT NULL CHECK (experimentation BETWEEN 0 AND 2),
  energy INTEGER NOT NULL CHECK (energy BETWEEN 0 AND 2),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
  status TEXT NOT NULL CHECK (status IN ('draft','published','withdrawn')),
  pack_id TEXT REFERENCES content_packs(id) ON DELETE RESTRICT,
  public_preview INTEGER NOT NULL DEFAULT 0 CHECK (public_preview IN (0,1)),
  PRIMARY KEY (activity_id, version),
  CHECK (public_preview = 0 OR (pack_id IS NULL AND heat = 0))
) STRICT;
CREATE INDEX activity_publication ON activity_versions(status, category_id, heat);
-- Tags are version metadata JSON in the foundation; add a join index only for measured queries.
CREATE TABLE wheels (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  title TEXT NOT NULL,
  selection_policy TEXT NOT NULL CHECK (selection_policy IN ('uniform','weighted')),
  status TEXT NOT NULL CHECK (status IN ('draft','published','withdrawn')),
  PRIMARY KEY (id, version)
) STRICT;
CREATE TABLE wheel_segments (
  wheel_id TEXT NOT NULL,
  wheel_version INTEGER NOT NULL,
  activity_id TEXT NOT NULL,
  activity_version INTEGER NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 1000),
  PRIMARY KEY (wheel_id, wheel_version, activity_id),
  FOREIGN KEY (wheel_id, wheel_version) REFERENCES wheels(id, version) ON DELETE CASCADE,
  FOREIGN KEY (activity_id, activity_version) REFERENCES activity_versions(activity_id, version) ON DELETE RESTRICT
) STRICT;
CREATE TABLE recipe_templates (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  title TEXT NOT NULL,
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
  status TEXT NOT NULL CHECK (status IN ('draft','published','withdrawn')),
  pack_id TEXT REFERENCES content_packs(id) ON DELETE RESTRICT,
  PRIMARY KEY (id, version)
) STRICT;
CREATE TABLE recipe_steps (
  recipe_id TEXT NOT NULL,
  recipe_version INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  phase TEXT NOT NULL CHECK (phase IN ('setup','warm-up','main','reconnect')),
  activity_id TEXT NOT NULL,
  activity_version INTEGER NOT NULL,
  PRIMARY KEY (recipe_id, recipe_version, position),
  FOREIGN KEY (recipe_id, recipe_version) REFERENCES recipe_templates(id, version) ON DELETE CASCADE,
  FOREIGN KEY (activity_id, activity_version) REFERENCES activity_versions(activity_id, version) ON DELETE RESTRICT
) STRICT;

CREATE TABLE preference_rounds (
  id TEXT PRIMARY KEY,
  couple_id TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  catalog_revision TEXT NOT NULL,
  deck_json TEXT NOT NULL CHECK (json_valid(deck_json)),
  state TEXT NOT NULL CHECK (state IN ('collecting','released','invalidated')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  UNIQUE (id, couple_id)
) STRICT;
CREATE INDEX preference_rounds_couple ON preference_rounds(couple_id, state);
CREATE TABLE private_preferences (
  round_id TEXT NOT NULL,
  couple_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  -- Padded authenticated encryption envelope contains responses AND explicit category opt-ins.
  envelope BLOB NOT NULL,
  key_version TEXT NOT NULL,
  share_authorized_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (round_id, user_id),
  FOREIGN KEY (round_id, couple_id) REFERENCES preference_rounds(id, couple_id) ON DELETE CASCADE,
  FOREIGN KEY (couple_id, user_id) REFERENCES memberships(couple_id, user_id) ON DELETE CASCADE
) STRICT;
CREATE TABLE mutual_snapshots (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL UNIQUE REFERENCES preference_rounds(id) ON DELETE CASCADE,
  couple_id TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  consent_epoch INTEGER NOT NULL,
  catalog_revision TEXT NOT NULL,
  envelope BLOB NOT NULL,
  key_version TEXT NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX mutual_snapshots_couple ON mutual_snapshots(couple_id, consent_epoch);
CREATE TABLE generated_recipes (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  couple_id TEXT REFERENCES couples(id) ON DELETE CASCADE,
  consent_epoch INTEGER,
  catalog_revision TEXT NOT NULL,
  envelope BLOB NOT NULL,
  key_version TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  CHECK ((owner_user_id IS NOT NULL AND couple_id IS NULL AND consent_epoch IS NULL)
    OR (owner_user_id IS NULL AND couple_id IS NOT NULL AND consent_epoch IS NOT NULL))
) STRICT;
CREATE TABLE saved_experiences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL REFERENCES generated_recipes(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, recipe_id)
) STRICT;
CREATE INDEX generated_recipes_expiry ON generated_recipes(expires_at);

CREATE TRIGGER preferences_insert_epoch AFTER INSERT ON private_preferences BEGIN
  UPDATE couples SET consent_epoch = consent_epoch + 1 WHERE id = NEW.couple_id;
END;
CREATE TRIGGER preferences_update_epoch AFTER UPDATE ON private_preferences BEGIN
  UPDATE couples SET consent_epoch = consent_epoch + 1 WHERE id = NEW.couple_id;
END;
CREATE TRIGGER preferences_delete_epoch AFTER DELETE ON private_preferences BEGIN
  UPDATE couples SET consent_epoch = consent_epoch + 1 WHERE id = OLD.couple_id;
END;
CREATE TRIGGER membership_update_epoch AFTER UPDATE OF state ON memberships BEGIN
  UPDATE couples SET consent_epoch = consent_epoch + 1 WHERE id = NEW.couple_id;
END;
CREATE TRIGGER membership_delete_epoch AFTER DELETE ON memberships BEGIN
  UPDATE couples SET consent_epoch = consent_epoch + 1 WHERE id = OLD.couple_id;
END;

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE
) STRICT;
CREATE TABLE product_versions (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','active','retired')),
  PRIMARY KEY (product_id, version)
) STRICT;
CREATE TABLE product_packs (
  product_id TEXT NOT NULL,
  product_version INTEGER NOT NULL,
  pack_id TEXT NOT NULL REFERENCES content_packs(id) ON DELETE RESTRICT,
  PRIMARY KEY (product_id, product_version, pack_id),
  FOREIGN KEY (product_id, product_version) REFERENCES product_versions(product_id, version) ON DELETE RESTRICT
) STRICT;
CREATE TABLE offers (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_version INTEGER NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  FOREIGN KEY (product_id, product_version) REFERENCES product_versions(product_id, version) ON DELETE RESTRICT,
  CHECK (ends_at IS NULL OR ends_at > starts_at)
) STRICT;
CREATE TABLE prices (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE RESTRICT,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  billing_period TEXT CHECK (billing_period IN ('month','year')),
  tax_behavior TEXT NOT NULL CHECK (tax_behavior IN ('inclusive','exclusive'))
) STRICT;
CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  buyer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  price_id TEXT NOT NULL REFERENCES prices(id) ON DELETE RESTRICT,
  processor TEXT NOT NULL,
  processor_purchase_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending','paid','refunded','disputed','cancelled')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (processor, processor_purchase_id)
) STRICT;
CREATE INDEX purchases_buyer ON purchases(buyer_user_id, created_at);
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  price_id TEXT NOT NULL REFERENCES prices(id) ON DELETE RESTRICT,
  processor TEXT NOT NULL,
  processor_subscription_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('trial','active','past_due','cancelled','ended')),
  current_period_end INTEGER NOT NULL,
  UNIQUE (processor, processor_subscription_id)
) STRICT;
CREATE TABLE entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL REFERENCES content_packs(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('free','ownership','subscription','trial','promotion','gift')),
  status TEXT NOT NULL CHECK (status IN ('active','suspended','revoked','refunded')),
  source_key TEXT NOT NULL,
  purchase_id TEXT REFERENCES purchases(id) ON DELETE RESTRICT,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE RESTRICT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  share_with_partner INTEGER NOT NULL DEFAULT 1 CHECK (share_with_partner IN (0,1)),
  UNIQUE (user_id, pack_id, source_key),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (kind NOT IN ('subscription','trial','promotion') OR ends_at IS NOT NULL)
) STRICT;
CREATE INDEX entitlement_lookup ON entitlements(user_id, pack_id, status, ends_at);
CREATE TABLE gift_redemptions (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL UNIQUE REFERENCES purchases(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  recipient_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  state TEXT NOT NULL CHECK (state IN ('unclaimed','redeemed','revoked','expired')),
  expires_at INTEGER NOT NULL,
  redeemed_at INTEGER
) STRICT;
CREATE TABLE refunds (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  processor_refund_id TEXT NOT NULL UNIQUE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  status TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE TABLE payment_events (
  id TEXT PRIMARY KEY,
  processor TEXT NOT NULL,
  processor_event_id TEXT NOT NULL,
  purchase_id TEXT REFERENCES purchases(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('received','applied','rejected')),
  received_at INTEGER NOT NULL DEFAULT (unixepoch()),
  processed_at INTEGER,
  UNIQUE (processor, processor_event_id)
) STRICT;
CREATE TABLE audit_records (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('allowed','denied','failed')),
  request_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX audit_retention ON audit_records(created_at);
