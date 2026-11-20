import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DISCOVERY_ENTRIES, DISCOVERY_WHEELS } from "../src/content/discovery/catalog.ts";
import { COOKBOOK } from "../src/content/recipes/cookbook.ts";
import { activitySchema } from "../src/domain/catalog.ts";
import { SLOT_PHASE } from "../src/domain/recipes.ts";

// Fresh, in-memory SQLite checks supplement the actual local D1 migration smoke test.
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON");
for (const file of readdirSync("migrations")
  .filter((name) => name.endsWith(".sql"))
  .sort()) {
  db.exec(readFileSync(`migrations/${file}`, "utf8"));
}
const seed = readFileSync("seeds/local.sql", "utf8");
db.exec(seed);
db.exec(seed);
db.exec(readFileSync("seeds/production.sql", "utf8"));
db.exec(readFileSync("seeds/production.sql", "utf8"));

const count = (sql: string) => (db.prepare(sql).get() as { total: number }).total;
const rows = (sql: string) => db.prepare(sql).all() as Record<string, unknown>[];

// ---------------------------------------------------------------- catalog checks
const PUBLISHED = DISCOVERY_ENTRIES.filter((entry) => entry.status === "published");
assert.equal(count("SELECT count(*) AS total FROM activity_versions"), DISCOVERY_ENTRIES.length);
assert.equal(
  count("SELECT count(*) AS total FROM activity_versions WHERE status = 'published'"),
  PUBLISHED.length,
);
assert.equal(count("SELECT count(*) AS total FROM activity_versions WHERE public_preview = 1"), 3);
// Content gate: no unreviewed heat-3 material may be published, at any tier.
assert.equal(
  count("SELECT count(*) AS total FROM activity_versions WHERE status = 'published' AND heat = 3"),
  0,
);
// Tier gate: every published public version is explicitly public_preview, and nothing
// else is. Heat never classifies access.
assert.equal(
  count(
    "SELECT count(*) AS total FROM activity_versions WHERE access_tier = 'public_preview' AND status = 'published'",
  ),
  PUBLISHED.length,
);
assert.equal(
  count("SELECT count(*) AS total FROM activity_versions WHERE access_tier = 'public_preview'"),
  PUBLISHED.length,
);
for (const row of rows("SELECT * FROM activity_versions")) {
  activitySchema.parse({
    ...JSON.parse(row.metadata_json as string),
    id: row.activity_id,
    version: row.version,
    title: row.title,
    description: row.description,
    category: row.category_id,
    heat: row.heat,
    experimentation: row.experimentation,
    energy: row.energy,
    durationMinutes: row.duration_minutes,
    status: row.status,
    packId: row.pack_id,
  });
}
// Consent-prefixed categories must be opt-in at the data layer, not only in metadata.
for (const category of ["touch", "senses", "fantasy", "power"]) {
  assert.equal(
    (
      db.prepare("SELECT required_opt_in FROM categories WHERE id = ?").get(category) as {
        required_opt_in: number;
      }
    ).required_opt_in,
    1,
  );
}

// ---------------------------------------------------------------- wheel integrity
assert.equal(
  count("SELECT count(*) AS total FROM wheels WHERE status = 'published'"),
  DISCOVERY_WHEELS.length,
);
for (const wheel of DISCOVERY_WHEELS) {
  assert.ok(
    count(
      `SELECT count(*) AS total FROM wheel_segments
       WHERE wheel_id = '${wheel.id}' AND wheel_version = ${wheel.version}`,
    ) > 0,
    `wheel ${wheel.id} has no segments`,
  );
  assert.equal(
    count(
      `SELECT count(*) AS total FROM wheel_segments ws
       JOIN activity_versions av ON av.activity_id = ws.activity_id AND av.version = ws.activity_version
       WHERE ws.wheel_id = '${wheel.id}' AND (av.status <> 'published' OR av.access_tier <> 'public_preview')`,
    ),
    0,
    `wheel ${wheel.id} references a non-public activity`,
  );
  assert.equal(
    count(
      `SELECT count(*) AS total FROM wheel_segments ws
       JOIN activity_versions av ON av.activity_id = ws.activity_id AND av.version = ws.activity_version
       WHERE ws.wheel_id = '${wheel.id}' AND av.heat > 2`,
    ),
    0,
    `wheel ${wheel.id} references heat 3`,
  );
  assert.equal(
    (db.prepare("SELECT draw_mode FROM wheels WHERE id = ?").get(wheel.id) as { draw_mode: string })
      .draw_mode,
    wheel.drawMode,
  );
}
assert.equal(
  count(
    `SELECT count(*) AS total FROM wheel_segments ws
     JOIN activity_versions av ON av.activity_id = ws.activity_id AND av.version = ws.activity_version
     WHERE av.status <> 'published'`,
  ),
  0,
  "no draft may appear on any wheel",
);

// ---------------------------------------------------------------- cookbook integrity
const publicRecipes = COOKBOOK.filter((recipe) => recipe.status === "published");
assert.equal(
  count("SELECT count(*) AS total FROM recipe_templates WHERE status = 'published'"),
  publicRecipes.length,
);
assert.equal(
  count(
    "SELECT count(*) AS total FROM recipe_templates WHERE status = 'published' AND (access_tier <> 'public_preview' OR public_preview <> 1)",
  ),
  0,
);
assert.equal(
  count("SELECT count(*) AS total FROM recipe_steps"),
  COOKBOOK.reduce((total, recipe) => total + recipe.steps.length, 0),
);
for (const row of rows(
  `SELECT rs.recipe_id, rs.recipe_version, rs.slot, rs.alternatives_json, av.status AS activity_status,
          av.access_tier, av.metadata_json
   FROM recipe_steps rs
   JOIN activity_versions av
     ON av.activity_id = rs.activity_id AND av.version = rs.activity_version`,
)) {
  assert.equal(row.activity_status, "published", `${row.recipe_id}: step primary unpublished`);
  assert.equal(row.access_tier, "public_preview", `${row.recipe_id}: step primary not public`);
  const metadata = JSON.parse(row.metadata_json as string) as { phases?: string[] };
  const phase = SLOT_PHASE[row.slot as keyof typeof SLOT_PHASE];
  assert.ok(
    (metadata.phases ?? []).includes(phase),
    `${row.recipe_id}: primary cannot fill the ${row.slot} slot`,
  );
  const alternatives = JSON.parse(row.alternatives_json as string) as {
    id: string;
    version: number;
  }[];
  for (const alternative of alternatives) {
    assert.equal(
      count(
        `SELECT count(*) AS total FROM activity_versions
         WHERE activity_id = '${alternative.id}' AND version = ${alternative.version}
           AND status = 'published' AND access_tier = 'public_preview'`,
      ),
      1,
      `${row.recipe_id}: substitution ${alternative.id} is not public`,
    );
  }
}
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

// ------------------------------------------------------------ identity/consent rules
assert.throws(() => db.exec("INSERT INTO memberships VALUES ('missing','missing',1,'active',0)"));
db.exec("INSERT INTO users(id) VALUES ('a'),('b'),('c')");
db.exec("INSERT INTO couples(id,status) VALUES ('pair','active')");
db.exec(
  "INSERT INTO memberships(couple_id,user_id,slot,state) VALUES ('pair','a',1,'active'),('pair','b',2,'active')",
);
assert.throws(() =>
  db.exec("INSERT INTO memberships(couple_id,user_id,slot,state) VALUES ('pair','c',3,'active')"),
);
assert.throws(() =>
  db.exec("INSERT INTO memberships(couple_id,user_id,slot,state) VALUES ('pair','c',2,'active')"),
);
db.exec(
  "INSERT INTO preference_rounds VALUES ('round','pair','sample-1','[]','collecting',0,1000)",
);
db.exec(
  "INSERT INTO private_preferences(round_id,couple_id,user_id,revision,envelope,key_version) VALUES ('round','pair','a',1,x'00','test-only')",
);
const epoch = () =>
  db.prepare("SELECT consent_epoch FROM couples WHERE id='pair'").get()?.consent_epoch as number;
const before = epoch();
db.exec("UPDATE private_preferences SET revision=2 WHERE user_id='a'");
assert.equal(epoch(), before + 1);
db.exec("UPDATE memberships SET state='revoked' WHERE user_id='b'");
assert.equal(epoch(), before + 2);
db.exec("DELETE FROM users WHERE id='a'");
assert.equal(count("SELECT count(*) AS total FROM private_preferences"), 0);
db.exec(
  "INSERT INTO payment_events(id,processor,processor_event_id,event_type,payload_digest,state) VALUES ('e1','test','same','paid','digest','received')",
);
assert.throws(() =>
  db.exec(
    "INSERT INTO payment_events(id,processor,processor_event_id,event_type,payload_digest,state) VALUES ('e2','test','same','paid','digest','received')",
  ),
);
assert.throws(() => db.exec("UPDATE activity_versions SET heat=4 WHERE activity_id='playlist'"));

// -------------------------------------------------------- guest discovery wheel state
db.exec(
  "INSERT INTO guest_sessions(id,created_at,expires_at) VALUES ('s1',1000,2000),('s2',1000,2000)",
);
assert.throws(() =>
  db.exec("INSERT INTO guest_sessions(id,created_at,expires_at) VALUES ('bad',2000,1000)"),
);
const insertSpin = (id: string, session: string, digest = "0".repeat(64)) =>
  db
    .prepare(
      `INSERT INTO guest_spins(id,session_id,request_digest,wheel_id,wheel_version,activity_id,
        activity_version,catalog_revision,created_at,expires_at)
       VALUES (?,?,?,'misfortune',1,'playlist',1,'test',1000,2000)`,
    )
    .run(id, session, digest);
insertSpin("spin-1", "s1");
assert.throws(() => insertSpin("spin-1", "s1"), "spin ids are unique idempotency keys");
assert.throws(() => insertSpin("spin-2", "missing"), "spin rows require a live session");
assert.throws(() => insertSpin("spin-3", "s1", "short"), "digests are fixed-width");
assert.equal(count("SELECT count(*) AS total FROM guest_spins WHERE session_id = 's1'"), 1);

// Paired draws persist both activities, and both must be public published versions.
const insertPair = (id: string, companionId: string | null, companionVersion: number | null) =>
  db
    .prepare(
      `INSERT INTO guest_spins(id,session_id,request_digest,wheel_id,wheel_version,activity_id,
        activity_version,companion_activity_id,companion_activity_version,catalog_revision,created_at,expires_at)
       VALUES (?,?,?,'double-trouble',1,'playlist',1,?,?,'test',1000,2000)`,
    )
    .run(id, "s1", "1".repeat(64), companionId, companionVersion);
insertPair("pair-ok", "compliments", 1);
assert.throws(() => insertPair("pair-shape", "compliments", null), "companion shape");
assert.throws(() => insertPair("pair-missing", "does-not-exist", 1), "companion must exist");
assert.throws(
  () => insertPair("pair-restricted", "draft-silk-and-ice", 1),
  "companion must be public",
);
assert.equal(
  count("SELECT count(*) AS total FROM guest_spins WHERE companion_activity_id IS NOT NULL"),
  1,
);

db.exec("DELETE FROM guest_sessions WHERE id = 's1'");
assert.equal(count("SELECT count(*) AS total FROM guest_spins"), 0, "session delete cascades");

assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
db.close();
console.log(
  "Migration, idempotent seed, tiered catalog, wheel modes, cookbook integrity, FK, capacity, revocation, deletion, guest-session cascade, paired-draw triggers and webhook uniqueness checks passed.",
);
