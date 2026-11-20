import { describe, expect, it } from "vitest";
import { eligibleActivities } from "../../src/domain/eligibility";
import { canonicalRequest, spinRequestSchema, toEligibilityContext } from "../../src/domain/wheel";
import { app } from "../../src/server";
import type { Bindings } from "../../src/server/bindings";
import {
  loadWheelCatalog,
  MAX_DIGEST_KEY_LENGTH,
  MIN_DIGEST_KEY_LENGTH,
  requestDigest,
  requestDigestKeyed,
} from "../../src/services/wheel";
import { createTestDatabase, seedCount, type TestDatabase } from "../support/d1";

/** Local development always has a key; the required-key path is the only path. */
const TEST_DIGEST_KEY = "test-digest-key-0123456789abcdef";

function envWith(db: D1Database, extra: Record<string, unknown> = {}): Bindings {
  return {
    DB: db,
    APP_ENV: "local",
    SPIN_DIGEST_KEY: TEST_DIGEST_KEY,
    ...extra,
  } as unknown as Bindings;
}

function env(db: D1Database): Bindings {
  return envWith(db);
}

/** Stand-in for the Cloudflare rate limiting binding. */
function limiter(behaviour: "allow" | "deny" | "error", seen: string[] = []) {
  return {
    limit: async ({ key }: { key: string }) => {
      seen.push(key);
      if (behaviour === "error") throw new Error("rate limiter unavailable");
      return { success: behaviour === "allow" };
    },
  } as unknown as RateLimit;
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
    shortlist: { id: string; index: number; title: string; heat: number; category: string }[];
    selectedIndex: number;
    eligibleCount: number;
    result: { id: string; title: string; heat: number; category: string; mode: string };
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

describe("required fingerprint key", () => {
  async function spinWithKey(
    database: TestDatabase,
    secret: unknown,
    body: Record<string, unknown> = {},
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
        body: JSON.stringify({ idempotencyKey: key(), ...body }),
      },
      envWith(database.db, { SPIN_DIGEST_KEY: secret }),
    );
  }

  const unusable: [string, unknown][] = [
    ["missing", undefined],
    ["empty", ""],
    ["short", "k".repeat(MIN_DIGEST_KEY_LENGTH - 1)],
    ["padded", `${"k".repeat(MIN_DIGEST_KEY_LENGTH)} `],
    ["multi-line", `k\n${"k".repeat(MIN_DIGEST_KEY_LENGTH)}`],
    ["non-ascii", "ü".repeat(MIN_DIGEST_KEY_LENGTH)],
    ["over-long", "k".repeat(MAX_DIGEST_KEY_LENGTH + 1)],
    ["wrong type", 1234567890],
  ];

  it.each(unusable)("fails closed on a %s key without writing anything", async (_label, value) => {
    expect(requestDigestKeyed(value)).toBe(false);
    const database = createTestDatabase();
    const response = await spinWithKey(database, value, { heat: "spicy" });
    expect(response.status).toBe(503);
    // Controlled and nonsensitive: a fixed code, no configuration and no key material.
    expect(await response.text()).toBe(JSON.stringify({ error: "unavailable" }));
    expect(seedCount(database.raw, "guest_sessions")).toBe(0);
    expect(seedCount(database.raw, "guest_spins")).toBe(0);
    const version = (await (
      await app.request("/api/version", {}, envWith(database.db, { SPIN_DIGEST_KEY: value }))
    ).json()) as { spinDigestKeyed: boolean };
    expect(version.spinDigestKeyed).toBe(false);
  });

  it("refuses to produce an unkeyed fingerprint at all", async () => {
    const canonical = canonicalRequest(
      spinRequestSchema.parse({ wheelId: "misfortune", idempotencyKey: key() }),
    );
    await expect(requestDigest(undefined, canonical)).rejects.toThrow(
      "spin_digest_key_unavailable",
    );
    await expect(requestDigest("short", canonical)).rejects.toThrow("spin_digest_key_unavailable");
    const stored = await requestDigest(TEST_DIGEST_KEY, canonical);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(requestDigestKeyed(TEST_DIGEST_KEY)).toBe(true);
  });

  it("stores an HMAC and never the boundary configuration", async () => {
    const database = createTestDatabase();
    const secret = "p".repeat(MIN_DIGEST_KEY_LENGTH);
    const body = {
      heat: "spicy",
      optIns: ["touch"],
      excludedCategories: ["connection"],
      idempotencyKey: key(),
    };
    const token = guestToken();
    const response = await spinWithKey(database, secret, body, { "x-cheapseggs-guest": token });
    expect(response.status).toBe(200);

    const canonical = canonicalRequest(spinRequestSchema.parse({ wheelId: "misfortune", ...body }));
    const stored = (
      database.raw.prepare("SELECT request_digest FROM guest_spins").get() as {
        request_digest: string;
      }
    ).request_digest;
    expect(stored).toHaveLength(64);
    expect(stored).toBe(await requestDigest(secret, canonical));
    expect(stored).not.toBe(await requestDigest("q".repeat(MIN_DIGEST_KEY_LENGTH), canonical));

    // Replay, concurrency and conflict semantics are unchanged under a valid key.
    const replay = await spinWithKey(database, secret, body, { "x-cheapseggs-guest": token });
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as { replayed: boolean }).replayed).toBe(true);
    expect(seedCount(database.raw, "guest_spins")).toBe(1);
    const changed = await spinWithKey(
      database,
      secret,
      { ...body, heat: "mild" },
      { "x-cheapseggs-guest": token },
    );
    expect(changed.status).toBe(409);
    expect(await changed.json()).toEqual({ error: "spin_conflict" });
  });

  it("rejects a replay after the key changes instead of guessing", async () => {
    const database = createTestDatabase();
    const body = { idempotencyKey: key() };
    const token = guestToken();
    const first = await spinWithKey(database, TEST_DIGEST_KEY, body, {
      "x-cheapseggs-guest": token,
    });
    expect(first.status).toBe(200);
    const rotated = await spinWithKey(database, "r".repeat(MIN_DIGEST_KEY_LENGTH), body, {
      "x-cheapseggs-guest": token,
    });
    expect(rotated.status).toBe(409);
    expect(await rotated.json()).toEqual({ error: "spin_conflict" });
    expect(seedCount(database.raw, "guest_spins")).toBe(1);
  });
});

describe("public endpoint abuse protection", () => {
  const body = () => JSON.stringify({ idempotencyKey: key() });

  it("refuses a spin over the client budget before touching guest state", async () => {
    const database = createTestDatabase();
    const seen: string[] = [];
    const response = await app.request(
      "/api/v1/spins",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cheapseggs-guest": guestToken(),
          "cf-connecting-ip": "203.0.113.9",
        },
        body: body(),
      },
      envWith(database.db, { SPIN_RATE_LIMITER: limiter("deny", seen) }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toEqual({ error: "rate_limited" });
    expect(seen).toEqual(["spin:203.0.113.9"]);
    expect(seedCount(database.raw, "guest_sessions")).toBe(0);
    expect(seedCount(database.raw, "guest_spins")).toBe(0);
  });

  it("limits the wheel description on its own counter", async () => {
    const database = createTestDatabase();
    const denied = await app.request(
      "/api/v1/wheels/misfortune",
      { headers: { "cf-connecting-ip": "198.51.100.4" } },
      envWith(database.db, { WHEEL_RATE_LIMITER: limiter("deny") }),
    );
    expect(denied.status).toBe(429);
    expect(await denied.json()).toEqual({ error: "rate_limited" });

    const allowed = await app.request(
      "/api/v1/wheels/misfortune",
      {},
      envWith(database.db, { WHEEL_RATE_LIMITER: limiter("allow") }),
    );
    expect(allowed.status).toBe(200);
  });

  it("fails open when the binding is absent or erroring", async () => {
    const database = createTestDatabase();
    for (const bindings of [{}, { SPIN_RATE_LIMITER: limiter("error") }]) {
      const response = await app.request(
        "/api/v1/spins",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-cheapseggs-guest": guestToken(),
          },
          body: body(),
        },
        envWith(database.db, bindings),
      );
      expect(response.status).toBe(200);
    }
  });

  it("reports the configured limiters on the version endpoint", async () => {
    const database = createTestDatabase();
    const version = (await (
      await app.request(
        "/api/version",
        {},
        envWith(database.db, {
          SPIN_RATE_LIMITER: limiter("allow"),
          WHEEL_RATE_LIMITER: limiter("allow"),
        }),
      )
    ).json()) as { rateLimits: { spin: boolean; wheel: boolean } };
    expect(version.rateLimits).toEqual({ spin: true, wheel: true });
  });
});

describe("content and consent integrity", () => {
  it("matches the result to the wedge the wheel marks as the winner", async () => {
    const database = createTestDatabase();
    const payload = await result(database, { heat: "spicy" });
    const winner = payload.shortlist[payload.selectedIndex];
    expect(winner).toBeDefined();
    expect(payload.result.id).toBe(winner?.id);
    expect(payload.result.title).toBe(winner?.title);
    expect(payload.result.heat).toBe(winner?.heat);
    expect(payload.result.category).toBe(winner?.category);
  });

  it("never serves a hard-NO or an un-opted-in category across many spins", async () => {
    const database = createTestDatabase();
    const catalog = await loadWheelCatalog(database.db, "misfortune");
    const consentPrefixed = (catalog?.categories ?? [])
      .filter((category) => category.requiredOptIn)
      .map((category) => category.id);
    expect(consentPrefixed.length).toBeGreaterThan(0);

    const token = guestToken();
    let seen = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await spin(
        database,
        { idempotencyKey: key(), heat: "spicy", excludedCategories: ["connection"] },
        { "x-cheapseggs-guest": token },
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        status: string;
        result?: { category: string; heat: number };
      };
      if (payload.status !== "result" || !payload.result) continue;
      seen++;
      expect(payload.result.category).not.toBe("connection");
      expect(consentPrefixed).not.toContain(payload.result.category);
      expect(payload.result.heat).toBeLessThanOrEqual(2);
    }
    expect(seen).toBeGreaterThan(10);
  });

  it("keeps heat and experimentation independent", async () => {
    const database = createTestDatabase();
    for (let attempt = 0; attempt < 12; attempt++) {
      const payload = await result(database, { heat: "mild", experimentation: "adventurous" });
      expect(payload.result.heat).toBe(0);
    }
    const catalog = await loadWheelCatalog(database.db, "misfortune");
    const wild = eligibleActivities(
      catalog?.activities ?? [],
      toEligibilityContext(
        spinRequestSchema.parse({
          idempotencyKey: key(),
          heat: "spicy",
          experimentation: "classic",
        }),
      ),
    );
    expect(wild.every((activity) => activity.experimentation === 0)).toBe(true);
  });

  it("rejects client state that tries to widen eligibility", async () => {
    const database = createTestDatabase();
    for (const extra of [
      { maxHeat: 3 },
      { eligibleIds: ["draft-habanero"] },
      { optIns: ["touch"], granted: true },
    ]) {
      const response = await spin(database, { idempotencyKey: key(), ...extra });
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "invalid_request" });
    }
    expect(seedCount(database.raw, "guest_sessions")).toBe(0);
  });

  it("never widens the pool to avoid a repeat", async () => {
    const database = createTestDatabase();
    const catalog = await loadWheelCatalog(database.db, "misfortune");
    const permissive = spinRequestSchema.parse({
      idempotencyKey: key(),
      heat: "spicy",
      experimentation: "adventurous",
      energy: "high",
      duration: "all-evening",
      environment: "home",
      supplies: (catalog?.supplies ?? []).map((supply) => supply.id),
      optIns: (catalog?.categories ?? [])
        .filter((category) => category.requiredOptIn)
        .map((category) => category.id),
    });
    const pool = eligibleActivities(catalog?.activities ?? [], toEligibilityContext(permissive));
    expect(pool.length).toBeGreaterThan(0);
    const keep = pool[0]?.id ?? "";
    const exclusions = (catalog?.activities ?? [])
      .map((activity) => activity.id)
      .filter((id) => id !== keep);
    expect(exclusions.length).toBeLessThanOrEqual(50);

    const token = guestToken();
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await spin(
        database,
        {
          idempotencyKey: key(),
          heat: "spicy",
          experimentation: "adventurous",
          energy: "high",
          duration: "all-evening",
          supplies: permissive.supplies,
          optIns: permissive.optIns,
          excludedActivities: exclusions,
        },
        { "x-cheapseggs-guest": token },
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { status: string; result?: { id: string } };
      expect(payload.status).toBe("result");
      // Repeat avoidance may repeat this single idea; it may never select an excluded one.
      expect(payload.result?.id).toBe(keep);
    }
  });
});
