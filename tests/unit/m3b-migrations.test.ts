import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../support/d1";

const migration = (name: string) => readFileSync(`migrations/${name}.sql`, "utf8");

describe("M3B migration integrity", () => {
  it.each([false, true])(
    "copies existing paired rows and fails closed on corrupt legacy data (%s)",
    (corrupt) => {
      const db = new DatabaseSync(":memory:");
      try {
        for (const name of [
          "0001_foundation",
          "0002_guest_wheel",
          "0003_better_auth",
          "0004_account_access",
          "0005_experiences",
        ])
          db.exec(migration(name));
        db.exec(readFileSync("seeds/local.sql", "utf8"));
        db.exec(`INSERT INTO guest_sessions VALUES ('existing',1,100);
        INSERT INTO guest_spins VALUES ('existing-pair','existing','${"0".repeat(64)}','double-trouble',1,'playlist',1,'original',1,100,'compliments',1);`);
        if (corrupt) db.exec("UPDATE guest_spins SET companion_activity_version = NULL");
        const before = db.prepare("SELECT * FROM guest_spins").all();
        db.exec("BEGIN");
        if (corrupt) {
          expect(() => db.exec(migration("0006_paired_spin_integrity"))).toThrow();
          db.exec("ROLLBACK");
        } else {
          db.exec(migration("0006_paired_spin_integrity"));
          db.exec("COMMIT");
        }
        expect(db.prepare("SELECT * FROM guest_spins").all()).toEqual(before);
        expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      } finally {
        db.close();
      }
    },
  );
  it("preserves pre-M3B spins through 0005 and 0006 with compatible defaults", () => {
    const db = new DatabaseSync(":memory:");
    try {
      for (const name of [
        "0001_foundation",
        "0002_guest_wheel",
        "0003_better_auth",
        "0004_account_access",
      ])
        db.exec(migration(name));
      db.exec(`INSERT INTO categories VALUES ('test', 'Test', 0);
        INSERT INTO activities(id) VALUES ('old');
        INSERT INTO activity_versions(activity_id,version,title,description,category_id,heat,experimentation,energy,duration_minutes,metadata_json,status,access_tier) VALUES ('old',1,'Old','Safe','test',0,0,0,5,'{}','published','public_preview');
        INSERT INTO wheels(id,version,title,selection_policy,status) VALUES ('old-wheel',1,'Old wheel','weighted','published');
        INSERT INTO guest_sessions VALUES ('old-session',1,100);
        INSERT INTO guest_spins VALUES ('old-spin','old-session','${"0".repeat(64)}','old-wheel',1,'old',1,'old-revision',1,100);`);
      const before = db.prepare("SELECT * FROM guest_spins").get();
      db.exec(migration("0005_experiences"));
      expect(db.prepare("SELECT draw_mode,shortlist_size FROM wheels").get()).toEqual({
        draw_mode: "single",
        shortlist_size: 8,
      });
      db.exec(migration("0006_paired_spin_integrity"));
      expect(db.prepare("SELECT * FROM guest_spins").get()).toEqual({
        ...before,
        companion_activity_id: null,
        companion_activity_version: null,
      });
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      db.exec("DELETE FROM guest_sessions");
      expect(db.prepare("SELECT * FROM guest_spins").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("protects companion references on insert, update, parent delete and parent key update", () => {
    const { raw } = createTestDatabase();
    try {
      // A new companion with no unrelated recipe/segment references isolates its FK.
      raw.exec(`INSERT INTO activities(id) VALUES ('companion-test');
        INSERT INTO activity_versions SELECT 'companion-test',version,title,description,category_id,heat,experimentation,energy,duration_minutes,metadata_json,status,pack_id,public_preview,access_tier FROM activity_versions WHERE activity_id='compliments';
        INSERT INTO guest_sessions VALUES ('session',1,100);
        INSERT INTO guest_spins VALUES ('pair','session','${"0".repeat(64)}','double-trouble',1,'playlist',1,'revision',1,100,'companion-test',1);`);
      for (const assignment of [
        "companion_activity_version=NULL",
        "companion_activity_id='missing'",
        "companion_activity_id='draft-silk-and-ice'",
      ]) {
        expect(() => raw.exec(`UPDATE guest_spins SET ${assignment} WHERE id='pair'`)).toThrow();
      }
      expect(() =>
        raw.exec("DELETE FROM activity_versions WHERE activity_id='companion-test'"),
      ).toThrow();
      expect(() =>
        raw.exec("UPDATE activity_versions SET version=2 WHERE activity_id='companion-test'"),
      ).toThrow();
      raw.exec(
        "UPDATE activity_versions SET status='withdrawn' WHERE activity_id='companion-test'",
      );
      expect(raw.prepare("SELECT companion_activity_id FROM guest_spins").get()).toEqual({
        companion_activity_id: "companion-test",
      });
      expect(raw.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      raw.exec("DELETE FROM guest_sessions");
      expect(raw.prepare("SELECT * FROM guest_spins").all()).toEqual([]);
      raw.exec("DELETE FROM activity_versions WHERE activity_id='companion-test'");
    } finally {
      raw.close();
    }
  });
});
