import { DISCOVERY_SUPPLIES } from "../content/discovery/catalog";
import type { Activity } from "../domain/catalog";
import { activitySchema } from "../domain/catalog";
import type { WheelCatalog, WheelCategory, WheelSupply } from "../domain/wheel";

/** Guest Discovery state: opaque, 24h, and bounded per session. No boundaries stored. */
export const GUEST_TTL_SECONDS = 24 * 60 * 60;
export const MAX_SPINS_PER_SESSION = 200;
export const PURGE_BATCH = 200;

export interface GuestSession {
  id: string;
  expiresAt: number;
}

export interface SpinRecord {
  id: string;
  sessionId: string;
  requestDigest: string;
  wheelId: string;
  wheelVersion: number;
  activityId: string;
  activityVersion: number;
  catalogRevision: string;
  createdAt: number;
  expiresAt: number;
}

interface SegmentRow {
  activity_id: string;
  activity_version: number;
  weight: number;
  title: string;
  description: string;
  category_id: string;
  heat: number;
  experimentation: number;
  energy: number;
  duration_minutes: number;
  metadata_json: string;
  status: string;
  pack_id: string | null;
  required_opt_in: number;
}

interface CategoryRow {
  id: string;
  title: string;
  required_opt_in: number;
}

interface SpinRow {
  id: string;
  session_id: string;
  request_digest: string;
  wheel_id: string;
  wheel_version: number;
  activity_id: string;
  activity_version: number;
  catalog_revision: string;
  created_at: number;
  expires_at: number;
}

interface Metadata {
  tags?: string[];
  environments?: Activity["environments"];
  supplies?: string[];
  preparation?: string[];
  accessibility?: string[];
  safetyFlags?: string[];
  requiredOptIns?: string[];
  incompatibleWith?: string[];
  phases?: Activity["phases"];
}

export function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Supplier labels are editorial; which supplies are offered comes from served rows. */
export function suppliesFor(activities: readonly Activity[]): WheelSupply[] {
  const used = new Set(activities.flatMap((activity) => activity.supplies));
  return DISCOVERY_SUPPLIES.filter((supply) => used.has(supply.id)).map((supply) => ({
    id: supply.id,
    title: supply.title,
  }));
}

/**
 * Loads one published wheel and its exact activity versions. A malformed or
 * non-published row is dropped rather than served: fail closed, never "best effort"
 * with unreviewed content.
 */
export async function loadWheelCatalog(
  db: D1Database,
  wheelId: string,
): Promise<WheelCatalog | null> {
  const wheel = await db
    .prepare(
      `SELECT id, version, title, selection_policy FROM wheels
       WHERE id = ? AND status = 'published' ORDER BY version DESC LIMIT 1`,
    )
    .bind(wheelId)
    .first<{ id: string; version: number; title: string; selection_policy: string }>();
  if (!wheel) return null;

  const { results: categoryRows } = await db
    .prepare("SELECT id, title, required_opt_in FROM categories ORDER BY id")
    .all<CategoryRow>();
  const categories: WheelCategory[] = categoryRows.map((row) => ({
    id: row.id,
    title: row.title,
    blurb: "",
    requiredOptIn: row.required_opt_in === 1,
  }));

  const { results: rows } = await db
    .prepare(
      `SELECT ws.activity_id, ws.activity_version, ws.weight, av.title, av.description,
              av.category_id, av.heat, av.experimentation, av.energy, av.duration_minutes,
              av.metadata_json, av.status, av.pack_id, c.required_opt_in
       FROM wheel_segments ws
       JOIN activity_versions av
         ON av.activity_id = ws.activity_id AND av.version = ws.activity_version
       JOIN categories c ON c.id = av.category_id
       WHERE ws.wheel_id = ? AND ws.wheel_version = ?
       ORDER BY ws.activity_id`,
    )
    .bind(wheel.id, wheel.version)
    .all<SegmentRow>();

  const activities: Activity[] = [];
  const weights: Record<string, number> = {};
  for (const row of rows) {
    if (row.status !== "published") continue;
    let metadata: Metadata;
    try {
      metadata = JSON.parse(row.metadata_json) as Metadata;
    } catch {
      continue;
    }
    // Category opt-in requirements are derived from D1, never from client input, so a
    // data-entry omission in metadata cannot silently offer a consent-prefixed idea.
    const requiredOptIns = [
      ...new Set([
        ...(metadata.requiredOptIns ?? []),
        ...(row.required_opt_in === 1 ? [row.category_id] : []),
      ]),
    ].sort();
    const parsed = activitySchema.safeParse({
      id: row.activity_id,
      version: row.activity_version,
      title: row.title,
      description: row.description,
      category: row.category_id,
      tags: metadata.tags ?? [],
      heat: row.heat,
      experimentation: row.experimentation,
      energy: row.energy,
      durationMinutes: row.duration_minutes,
      environments: metadata.environments ?? [],
      supplies: metadata.supplies ?? [],
      preparation: metadata.preparation ?? [],
      accessibility: metadata.accessibility ?? [],
      safetyFlags: metadata.safetyFlags ?? [],
      requiredOptIns,
      incompatibleWith: metadata.incompatibleWith ?? [],
      phases: metadata.phases ?? [],
      status: row.status,
      packId: row.pack_id ?? null,
    });
    if (parsed.success) {
      activities.push(parsed.data);
      weights[row.activity_id] = row.weight;
    }
  }
  return {
    wheel: {
      id: wheel.id,
      version: wheel.version,
      title: wheel.title,
      tagline: "Spin responsibly. Misbehave consensually.",
      selectionPolicy: wheel.selection_policy === "weighted" ? "weighted" : "uniform",
      shortlistSize: 8,
    },
    activities,
    weights,
    categories,
    supplies: suppliesFor(activities),
    revision: `${wheel.id}@${wheel.version}+${await revisionOf(
      wheel.id,
      wheel.version,
      activities,
      categories,
    )}`,
  };
}

/** Content-derived revision label; changes whenever served copy or gating changes. */
async function revisionOf(
  wheelId: string,
  wheelVersion: number,
  activities: readonly Activity[],
  categories: readonly WheelCategory[],
): Promise<string> {
  const canonical = JSON.stringify({
    wheel: `${wheelId}@${wheelVersion}`,
    categories: categories.map((category) => `${category.id}:${category.requiredOptIn ? 1 : 0}`),
    activities: [...activities]
      .map(
        (activity) =>
          `${activity.id}@${activity.version}:${activity.heat}:${activity.status}:${activity.requiredOptIns.join("|")}`,
      )
      .sort(),
  });
  return (await digest(canonical)).slice(0, 16);
}

/**
 * Bounded lazy purge. No scheduled job is added: each spin request clears a small
 * batch of expired rows, so the tables cannot grow without traffic-driven cleanup.
 */
export async function purgeExpired(db: D1Database, now: number): Promise<void> {
  await db
    .prepare(
      `DELETE FROM guest_spins WHERE rowid IN
         (SELECT rowid FROM guest_spins WHERE expires_at < ? LIMIT ${PURGE_BATCH})`,
    )
    .bind(now)
    .run();
  await db
    .prepare(
      `DELETE FROM guest_sessions WHERE rowid IN
         (SELECT rowid FROM guest_sessions WHERE expires_at < ? LIMIT ${PURGE_BATCH})`,
    )
    .bind(now)
    .run();
}

/**
 * Records a client-proposed opaque nonce for this guest session. The nonce is a
 * 32-byte random header value, never a cookie, never derived from content, and it
 * grants nothing but its own idempotency/variety rows. Proposing it up front removes
 * the first-request race that a server-issued token would create for a double tap.
 */
export async function ensureGuestSession(
  db: D1Database,
  id: string,
  now: number,
): Promise<GuestSession | null> {
  const existing = await findGuestSession(db, id, now);
  if (existing) return existing;
  await db
    .prepare("INSERT OR IGNORE INTO guest_sessions(id, created_at, expires_at) VALUES (?, ?, ?)")
    .bind(id, now, now + GUEST_TTL_SECONDS)
    .run();
  const created = await findGuestSession(db, id, now);
  if (created) return created;
  // A stale row with this nonce expired; replace it rather than resurrect old links.
  await deleteGuestSession(db, id);
  await db
    .prepare("INSERT INTO guest_sessions(id, created_at, expires_at) VALUES (?, ?, ?)")
    .bind(id, now, now + GUEST_TTL_SECONDS)
    .run();
  return findGuestSession(db, id, now);
}

export async function findGuestSession(
  db: D1Database,
  id: string,
  now: number,
): Promise<GuestSession | null> {
  const row = await db
    .prepare("SELECT id, expires_at FROM guest_sessions WHERE id = ? AND expires_at > ?")
    .bind(id, now)
    .first<{ id: string; expires_at: number }>();
  return row ? { id: row.id, expiresAt: row.expires_at } : null;
}

export async function deleteGuestSession(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM guest_sessions WHERE id = ?").bind(id).run();
}

export async function countSessionSpins(db: D1Database, sessionId: string): Promise<number> {
  const row = await db
    .prepare("SELECT count(*) AS total FROM guest_spins WHERE session_id = ?")
    .bind(sessionId)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

/** Recent results provide variety only; they never become an eligibility input. */
export async function recentActivityIds(
  db: D1Database,
  sessionId: string,
  limit = 12,
): Promise<Set<string>> {
  const { results } = await db
    .prepare(
      "SELECT activity_id FROM guest_spins WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
    )
    .bind(sessionId, limit)
    .all<{ activity_id: string }>();
  return new Set(results.map((row) => row.activity_id));
}

function toSpinRecord(row: SpinRow): SpinRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    requestDigest: row.request_digest,
    wheelId: row.wheel_id,
    wheelVersion: row.wheel_version,
    activityId: row.activity_id,
    activityVersion: row.activity_version,
    catalogRevision: row.catalog_revision,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function findSpin(db: D1Database, id: string): Promise<SpinRecord | null> {
  const row = await db.prepare("SELECT * FROM guest_spins WHERE id = ?").bind(id).first<SpinRow>();
  return row ? toSpinRecord(row) : null;
}

/**
 * Inserts the authoritative result. `INSERT OR IGNORE` makes a concurrent duplicate
 * request a no-op that the caller resolves by re-reading the winning row.
 */
export async function insertSpin(
  db: D1Database,
  record: Omit<SpinRecord, "createdAt">,
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO guest_spins
         (id, session_id, request_digest, wheel_id, wheel_version, activity_id,
          activity_version, catalog_revision, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      record.id,
      record.sessionId,
      record.requestDigest,
      record.wheelId,
      record.wheelVersion,
      record.activityId,
      record.activityVersion,
      record.catalogRevision,
      now,
      record.expiresAt,
    )
    .run();
  return (result.meta?.changes ?? 0) > 0;
}
