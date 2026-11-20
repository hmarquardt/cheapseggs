import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { activitySchema } from "../src/domain/catalog.ts";

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
assert.equal(db.prepare("SELECT count(*) AS count FROM activity_versions").get()?.count, 3);
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
for (const row of db.prepare("SELECT * FROM activity_versions").all()) {
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
assert.equal(db.prepare("SELECT count(*) AS count FROM private_preferences").get()?.count, 0);
db.exec(
  "INSERT INTO payment_events(id,processor,processor_event_id,event_type,payload_digest,state) VALUES ('e1','test','same','paid','digest','received')",
);
assert.throws(() =>
  db.exec(
    "INSERT INTO payment_events(id,processor,processor_event_id,event_type,payload_digest,state) VALUES ('e2','test','same','paid','digest','received')",
  ),
);
assert.throws(() => db.exec("UPDATE activity_versions SET heat=4 WHERE activity_id='playlist'"));
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
db.close();
console.log(
  "Migration, idempotent seed, catalog validation, FK, capacity, revocation, deletion, and webhook uniqueness checks passed.",
);
