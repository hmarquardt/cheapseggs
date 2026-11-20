import { describe, expect, it } from "vitest";
import { app } from "../../src/server";
import type { Bindings } from "../../src/server/bindings";
import { loadWheelCatalog } from "../../src/services/wheel";
import { createTestDatabase, seedCount, type TestDatabase } from "../support/d1";

function env(db: D1Database): Bindings {
  return { DB: db, APP_ENV: "local" } as unknown as Bindings;
}

function key(): string {
  return crypto.randomUUID();
}

/** Opaque 32-byte guest nonce, exactly what the browser holds in memory. */
function guestToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function spin(
  database: TestDatabase,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.request(
    "/api/v1/spins",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cheapseggs-guest": guestToken(),
        ...headers,
      },
      body: JSON.stringify(body),
    },
    env(database.db),
  );
}

async function result(database: TestDatabase, body: Record<string, unknown> = {}) {
  const response = await spin(database, { idempotencyKey: key(), ...body });
  expect(response.status).toBe(200);
  const payload = (await response.json()) as {
    status: string;
    guest: { id: string };
    shortlist: { id: string; index: number; title: string }[];
    selectedIndex: number;
    eligibleCount: number;
    result: { id: string; heat: number; category: string; mode: string };
  };
  expect(payload.status).toBe("result");
  return payload;
}

describe("wheel configuration endpoint", () => {
  it("publishes bounded catalog metadata without personal context", async () => {
    const database = createTestDatabase();
    const response = await app.request("/api/v1/wheels/misfortune", undefined, env(database.db));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    const body = (await response.json()) as {
      counts: { total: number; byHeat: Record<string, number> };
      options: { heat: { key: string; available: boolean }[] };
      categories: { requiredOptIn: boolean }[];
      disclosure: { promptNotConsent: boolean };
    };
    expect(body.counts.total).toBe(44);
    // Content gate: unreviewed heat-3 material must never be published or counted.
    expect(body.counts.byHeat["3"]).toBe(0);
    expect(body.options.heat.find((option) => option.key === "habanero")).toMatchObject({
      available: false,
    });
    expect(body.categories.filter((category) => category.requiredOptIn)).toHaveLength(3);
    expect(body.disclosure.promptNotConsent).toBe(true);
    expect(JSON.stringify(body)).not.toContain("guest");
  });

  it("does not expose a draft wheel or an unknown wheel", async () => {
    const database = createTestDatabase();
    for (const id of ["chemistry-preview", "unknown"]) {
      expect((await app.request(`/api/v1/wheels/${id}`, undefined, env(database.db))).status).toBe(
        404,
      );
    }
  });

  it("fails closed without a database binding", async () => {
    const response = await app.request("/api/v1/wheels/misfortune");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
});

describe("server-side eligibility", () => {
  it("honours heat, opt-in and exclusion boundaries from the D1 catalog", async () => {
    const database = createTestDatabase();
    const catalog = await loadWheelCatalog(database.db, "misfortune");
    expect(catalog?.activities).toHaveLength(44);
    const { eligibleActivities } = await import("../../src/domain/eligibility");
    const { spinRequestSchema, toEligibilityContext } = await import("../../src/domain/wheel");
    const eligible = (overrides: Record<string, unknown>) =>
      eligibleActivities(
        catalog?.activities ?? [],
        toEligibilityContext(spinRequestSchema.parse({ idempotencyKey: key(), ...overrides })),
      );

    const mild = eligible({ heat: "mild" });
    expect(mild.every((activity) => activity.heat === 0)).toBe(true);
    expect(
      mild.some((activity) => ["touch", "senses", "fantasy"].includes(activity.category)),
    ).toBe(false);

    const withOptIn = eligible({ heat: "spicy", optIns: ["touch"] });
    expect(withOptIn.some((activity) => activity.category === "touch")).toBe(true);
    expect(withOptIn.some((activity) => activity.category === "senses")).toBe(false);

    const excluded = eligible({ heat: "spicy", excludedCategories: ["connection", "playful"] });
    expect(excluded.some((activity) => ["connection", "playful"].includes(activity.category))).toBe(
      false,
    );

    const hardNo = eligible({ heat: "spicy", excludedActivities: ["compliments"] });
    expect(hardNo.some((activity) => activity.id === "compliments")).toBe(false);
  });

  it("never serves an unreviewed draft activity", async () => {
    const database = createTestDatabase();
    const catalog = await loadWheelCatalog(database.db, "misfortune");
    expect(catalog?.activities.some((activity) => activity.status !== "published")).toBe(false);
    expect(catalog?.activities.some((activity) => activity.id.startsWith("draft-"))).toBe(false);
  });
});

describe("authoritative spins", () => {
  it("returns a server-selected result with a readable shortlist", async () => {
    const database = createTestDatabase();
    const payload = await result(database);
    expect(payload.result.mode).toBe("discovery-prompt-not-consent");
    expect(payload.shortlist.length).toBeLessThanOrEqual(8);
    expect(payload.shortlist[payload.selectedIndex]?.id).toBe(payload.result.id);
    expect(payload.eligibleCount).toBeGreaterThan(0);
    expect(new Set(payload.shortlist.map((segment) => segment.id)).size).toBe(
      payload.shortlist.length,
    );
    expect(payload.guest.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("respects the requested ceiling across many independent spins", async () => {
    const database = createTestDatabase();
    for (let attempt = 0; attempt < 12; attempt++) {
      const payload = await result(database, { heat: "mild" });
      expect(payload.result.heat).toBe(0);
    }
  });

  it("replays an identical request and rejects a changed one", async () => {
    const database = createTestDatabase();
    const idempotencyKey = key();
    const token = guestToken();
    const first = (await (
      await spin(database, { idempotencyKey }, { "x-cheapseggs-guest": token })
    ).json()) as { result: { id: string } };
    const replay = await spin(database, { idempotencyKey }, { "x-cheapseggs-guest": token });
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as {
      replayed: boolean;
      result: { id: string };
      guest: { id: string };
    };
    expect(replayBody.replayed).toBe(true);
    expect(replayBody.result.id).toBe(first.result.id);
    expect(replayBody.guest.id).toBe(token);
    expect(seedCount(database.raw, "guest_spins")).toBe(1);

    const changed = await spin(
      database,
      { idempotencyKey, heat: "spicy" },
      { "x-cheapseggs-guest": token },
    );
    expect(changed.status).toBe(409);
    expect(await changed.json()).toEqual({ error: "spin_conflict" });
  });

  it("returns one durable result for concurrent duplicates", async () => {
    const database = createTestDatabase();
    const idempotencyKey = key();
    const token = guestToken();
    const [a, b] = await Promise.all([
      spin(database, { idempotencyKey }, { "x-cheapseggs-guest": token }),
      spin(database, { idempotencyKey }, { "x-cheapseggs-guest": token }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const first = (await a.json()) as { result: { id: string } };
    const second = (await b.json()) as { result: { id: string }; replayed: boolean };
    expect(second.result.id).toBe(first.result.id);
    expect(seedCount(database.raw, "guest_spins")).toBe(1);
  });

  it("refuses a result claimed by a different guest session", async () => {
    const database = createTestDatabase();
    const idempotencyKey = key();
    const first = (await (await spin(database, { idempotencyKey })).json()) as {
      guest: { id: string };
    };
    expect(first.guest.id).toMatch(/^[0-9a-f]{64}$/);
    const other = await spin(database, { idempotencyKey });
    expect(other.status).toBe(409);
    expect(await other.json()).toEqual({ error: "spin_conflict" });
  });

  it("requires an opaque guest nonce instead of issuing a cookie", async () => {
    const database = createTestDatabase();
    const missing = await app.request(
      "/api/v1/spins",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: key() }),
      },
      env(database.db),
    );
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "guest_session_required" });
    expect(missing.headers.get("set-cookie")).toBeNull();
    expect(seedCount(database.raw, "guest_sessions")).toBe(0);
  });

  it("invalidates a replay when the catalog withdraws the result", async () => {
    const database = createTestDatabase();
    const idempotencyKey = key();
    const token = guestToken();
    const first = (await (
      await spin(database, { idempotencyKey }, { "x-cheapseggs-guest": token })
    ).json()) as {
      guest: { id: string };
    };
    expect(first.guest.id).toBe(token);
    database.raw
      .prepare("UPDATE guest_spins SET activity_id='compliments', activity_version=1 WHERE id=?")
      .run(idempotencyKey);
    const replay = await spin(database, { idempotencyKey }, { "x-cheapseggs-guest": token });
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as { result: { id: string } }).result.id).toBe("compliments");

    database.raw
      .prepare("UPDATE activity_versions SET status='withdrawn' WHERE activity_id='compliments'")
      .run();
    const withdrawn = await spin(database, { idempotencyKey }, { "x-cheapseggs-guest": token });
    expect(withdrawn.status).toBe(409);
    expect(await withdrawn.json()).toEqual({ error: "spin_invalidated" });
  });

  it("reports an empty pool without relaxing a boundary", async () => {
    const database = createTestDatabase();
    const response = await spin(database, {
      idempotencyKey: key(),
      excludedCategories: [
        "connection",
        "playful",
        "atmosphere",
        "movement",
        "touch",
        "senses",
        "fantasy",
        "reconnect",
      ],
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      eligibleCount: number;
      hints: unknown[];
      message: string;
    };
    expect(body.status).toBe("empty");
    expect(body.eligibleCount).toBe(0);
    expect(body.hints).toEqual([]);
    expect(body.message).toContain("Nothing was loosened");
    expect(seedCount(database.raw, "guest_spins")).toBe(0);
  });

  it("suggests only ceiling relaxations when a narrow menu is empty", async () => {
    const database = createTestDatabase();
    const response = await spin(database, {
      idempotencyKey: key(),
      heat: "mild",
      optIns: ["senses", "fantasy"],
      excludedCategories: ["connection", "playful", "atmosphere", "movement", "touch", "reconnect"],
    });
    const body = (await response.json()) as {
      status: string;
      hints: { changes: { kind: string }[]; added: number }[];
    };
    expect(body.status).toBe("empty");
    expect(body.hints.length).toBeGreaterThan(0);
    for (const hint of body.hints) {
      expect(hint.added).toBeGreaterThan(0);
      expect(hint.changes.length).toBeGreaterThan(0);
      expect(hint.changes.length).toBeLessThanOrEqual(2);
      for (const change of hint.changes)
        expect(["heat", "experimentation", "energy", "duration"]).toContain(change.kind);
    }
  });

  describe("guest session lifecycle", () => {
    it("reuses a presented nonce and never stores boundaries", async () => {
      const database = createTestDatabase();
      const token = guestToken();
      const first = (await (
        await spin(database, { idempotencyKey: key() }, { "x-cheapseggs-guest": token })
      ).json()) as { guest: { id: string } };
      const second = (await (
        await spin(
          database,
          { idempotencyKey: key(), heat: "spicy" },
          {
            "x-cheapseggs-guest": token,
          },
        )
      ).json()) as { guest: { id: string } };
      expect(second.guest.id).toBe(first.guest.id);

      const columns = database.raw.prepare("SELECT * FROM guest_spins LIMIT 1").get() as Record<
        string,
        unknown
      >;
      expect(Object.keys(columns).sort()).toEqual([
        "activity_id",
        "activity_version",
        "catalog_revision",
        "created_at",
        "expires_at",
        "id",
        "request_digest",
        "session_id",
        "wheel_id",
        "wheel_version",
      ]);
      expect(String(columns.request_digest)).toMatch(/^[0-9a-f]{64}$/);
      for (const value of Object.values(columns))
        expect(JSON.stringify(value)).not.toMatch(/spicy|excludedCategories|optIns/);
    });

    it("expires guest state after 24h instead of resurrecting it", async () => {
      const database = createTestDatabase();
      const token = guestToken();
      const first = (await (
        await spin(database, { idempotencyKey: key() }, { "x-cheapseggs-guest": token })
      ).json()) as { guest: { id: string; expiresAt: number } };
      const ttl = first.guest.expiresAt - Math.floor(Date.now() / 1000);
      expect(ttl).toBeGreaterThan(86_000);
      expect(ttl).toBeLessThanOrEqual(86_400);

      database.raw
        .prepare(
          "UPDATE guest_sessions SET created_at = unixepoch() - 200000, expires_at = unixepoch() - 100000",
        )
        .run();
      const fresh = (await (
        await spin(database, { idempotencyKey: key() }, { "x-cheapseggs-guest": token })
      ).json()) as { guest: { expiresAt: number } };
      expect(fresh.guest.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 86_000);
      expect(seedCount(database.raw, "guest_sessions")).toBe(1);
      // Expired spins were purged with their session rather than linked to the new one.
      expect(seedCount(database.raw, "guest_spins")).toBe(1);
    });

    it("deletes guest state on explicit reset", async () => {
      const database = createTestDatabase();
      const token = guestToken();
      await spin(database, { idempotencyKey: key() }, { "x-cheapseggs-guest": token });
      const reset = await app.request(
        "/api/v1/guest",
        { method: "DELETE", headers: { "x-cheapseggs-guest": token } },
        env(database.db),
      );
      expect(reset.status).toBe(204);
      expect(seedCount(database.raw, "guest_sessions")).toBe(0);
      expect(seedCount(database.raw, "guest_spins")).toBe(0);
      const again = await app.request(
        "/api/v1/guest",
        { method: "DELETE", headers: { "x-cheapseggs-guest": "not-a-token" } },
        env(database.db),
      );
      expect(again.status).toBe(204);
    });

    it("stops a session at its bounded spin budget", async () => {
      const database = createTestDatabase();
      const token = guestToken();
      await spin(database, { idempotencyKey: key() }, { "x-cheapseggs-guest": token });
      database.raw
        .prepare(
          `INSERT INTO guest_spins
           (id, session_id, request_digest, wheel_id, wheel_version, activity_id,
            activity_version, catalog_revision, created_at, expires_at)
         SELECT 'filler-' || value, ?, ?, 'misfortune', 1, 'playlist', 1, 'test',
                unixepoch(), unixepoch() + 3600
         FROM (WITH RECURSIVE counter(value) AS
                 (SELECT 1 UNION ALL SELECT value + 1 FROM counter WHERE value < 200)
               SELECT value FROM counter)`,
        )
        .run(token, "0".repeat(64));
      const response = await spin(
        database,
        { idempotencyKey: key() },
        {
          "x-cheapseggs-guest": token,
        },
      );
      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: "guest_budget_exhausted" });
    });
  });

  describe("spin request boundaries", () => {
    it("rejects non-JSON, malformed, oversized and unknown input", async () => {
      const database = createTestDatabase();
      const token = guestToken();
      const request = (init: RequestInit) => app.request("/api/v1/spins", init, env(database.db));
      expect(
        (
          await request({
            method: "POST",
            headers: { "x-cheapseggs-guest": token },
            body: "{}",
          })
        ).status,
      ).toBe(415);
      expect(
        (
          await request({
            method: "POST",
            headers: { "content-type": "application/json", "x-cheapseggs-guest": token },
            body: "{",
          })
        ).status,
      ).toBe(422);
      for (const body of [
        { idempotencyKey: "not-a-uuid" },
        { idempotencyKey: key(), heat: "nuclear" },
        { idempotencyKey: key(), surprise: true },
        { idempotencyKey: key(), optIns: ["invented-category"] },
        { idempotencyKey: key(), supplies: ["private-jet"] },
      ]) {
        expect((await spin(database, body, { "x-cheapseggs-guest": token })).status).toBe(422);
      }
      expect(
        (
          await request({
            method: "POST",
            headers: { "content-type": "application/json", "x-cheapseggs-guest": token },
            body: JSON.stringify({ idempotencyKey: key(), padding: "x".repeat(5000) }),
          })
        ).status,
      ).toBe(413);
    });

    it("rejects cross-site posts before touching guest state", async () => {
      const database = createTestDatabase();
      const foreign = await app.request(
        "/api/v1/spins",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-cheapseggs-guest": guestToken(),
            origin: "https://untrusted.example",
            "sec-fetch-site": "cross-site",
          },
          body: JSON.stringify({ idempotencyKey: key() }),
        },
        env(database.db),
      );
      expect(foreign.status).toBe(403);
      expect(await foreign.json()).toEqual({ error: "origin_rejected" });
      expect(seedCount(database.raw, "guest_sessions")).toBe(0);
    });

    it("keeps the existing API boundaries intact", async () => {
      const database = createTestDatabase();
      expect(
        (await app.request("/api/v1/preferences/other", undefined, env(database.db))).status,
      ).toBe(404);
      expect(
        (await app.request("/api/payments/webhook", { method: "POST" }, env(database.db))).status,
      ).toBe(503);
    });
  });
});
