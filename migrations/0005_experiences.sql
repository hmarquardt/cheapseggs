-- M3B: multiple wheel modes, paired draws and the Romance Cookbook.
-- Append-only. Existing wheel rows and activity versions keep their meaning.
PRAGMA foreign_keys = ON;

-- Category blurbs explain the consent prefix in the interface; the gate itself stays
-- the numeric `required_opt_in` column.
ALTER TABLE categories ADD COLUMN blurb TEXT NOT NULL DEFAULT '';

-- Presentation and draw policy are columns now, so four public wheels can coexist.
ALTER TABLE wheels ADD COLUMN tagline TEXT NOT NULL DEFAULT '';
ALTER TABLE wheels ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE wheels ADD COLUMN draw_mode TEXT NOT NULL DEFAULT 'single'
  CHECK (draw_mode IN ('single','pair','category'));
ALTER TABLE wheels ADD COLUMN shortlist_size INTEGER NOT NULL DEFAULT 8
  CHECK (shortlist_size BETWEEN 1 AND 12);

-- A paired draw persists both activities, so an idempotent replay can return the pair.
ALTER TABLE guest_spins ADD COLUMN companion_activity_id TEXT;
ALTER TABLE guest_spins ADD COLUMN companion_activity_version INTEGER;
CREATE TRIGGER guest_spins_companion_shape_insert BEFORE INSERT ON guest_spins
WHEN (NEW.companion_activity_id IS NULL) <> (NEW.companion_activity_version IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'companion id and version must be set together');
END;
CREATE TRIGGER guest_spins_companion_exists_insert BEFORE INSERT ON guest_spins
WHEN NEW.companion_activity_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM activity_versions
  WHERE activity_id = NEW.companion_activity_id
    AND version = NEW.companion_activity_version
    AND access_tier = 'public_preview'
    AND status = 'published'
)
BEGIN
  SELECT RAISE(ABORT, 'companion must be a published public activity version');
END;

-- The foundation already reserved `recipe_templates` and `recipe_steps` for exactly this
-- purpose, so M3B extends them instead of inventing a parallel cookbook schema. Recipe
-- rows stay immutable per version; only these presentation/consent columns are added.
ALTER TABLE recipe_templates ADD COLUMN access_tier TEXT NOT NULL DEFAULT 'restricted'
  CHECK (access_tier IN ('public_preview','registered_adult','verified_adult','restricted'));
ALTER TABLE recipe_templates ADD COLUMN public_preview INTEGER NOT NULL DEFAULT 0
  CHECK (public_preview IN (0,1));

ALTER TABLE recipe_steps ADD COLUMN slot TEXT NOT NULL DEFAULT 'main'
  CHECK (slot IN ('preparation','atmosphere','warm-up','main','surprise','finale'));
ALTER TABLE recipe_steps ADD COLUMN optional INTEGER NOT NULL DEFAULT 0
  CHECK (optional IN (0,1));
ALTER TABLE recipe_steps ADD COLUMN guidance TEXT NOT NULL DEFAULT '';
ALTER TABLE recipe_steps ADD COLUMN alternatives_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(alternatives_json));
ALTER TABLE recipe_steps ADD COLUMN max_minutes INTEGER NOT NULL DEFAULT 30
  CHECK (max_minutes BETWEEN 1 AND 120);
CREATE INDEX recipe_steps_activity ON recipe_steps(activity_id, activity_version);
