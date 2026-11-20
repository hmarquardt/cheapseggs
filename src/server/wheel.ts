import { type Context, Hono } from "hono";
import { SITE_ORIGIN } from "../config/site";
import type { Activity } from "../domain/catalog";
import { eligibleActivities } from "../domain/eligibility";
import {
  candidatePool,
  canonicalRequest,
  type DealerChoice,
  DURATION_OPTIONS,
  dealerChoice,
  ENERGY_OPTIONS,
  ENVIRONMENT_OPTIONS,
  EXPERIMENTATION_OPTIONS,
  emptyHints,
  GUEST_TOKEN,
  HEAT_OPTIONS,
  minutesOf,
  PUBLIC_WHEEL_IDS,
  planPairSpin,
  planSpin,
  type SpinPlan,
  type SpinRequest,
  type SpinResponse,
  shortlistAround,
  spinRequestSchema,
  toEligibilityContext,
  toResultDto,
  toSegmentDtos,
  type WheelCatalog,
  type WheelConfigDto,
} from "../domain/wheel";
import {
  countSessionSpins,
  deleteGuestSession,
  ensureGuestSession,
  findSpin,
  GUEST_TTL_SECONDS,
  type GuestSession,
  insertSpin,
  listPublicWheels,
  loadWheelCatalog,
  MAX_SPINS_PER_SESSION,
  purgeExpired,
  recentActivityIds,
  requestDigest,
  requestDigestKeyed,
  type SpinRecord,
} from "../services/wheel";
import type { Bindings } from "./bindings";
import { boundedText } from "./body";

export const WHEEL_ID = "misfortune";
const MAX_BODY_BYTES = 4096;
/** Advertised back-off for an approximate, per-location Cloudflare rate limit. */
const RATE_LIMIT_RETRY_SECONDS = 60;

export const wheelRoutes = new Hono<{ Bindings: Bindings }>();

type LimiterKind = "spin" | "wheel";

/**
 * Approximate abuse speed bump in front of the public endpoints. Cloudflare counts per
 * client and per location in its own infrastructure, so nothing about a visitor is
 * written to D1. It is deliberately not a security control: it fails open, and the
 * per-session spin budget plus the 4 KiB body cap still apply if it is unavailable.
 */
export async function rateLimited(
  env: Bindings,
  kind: LimiterKind,
  clientKey: string | undefined,
): Promise<boolean> {
  const limiter = kind === "spin" ? env.SPIN_RATE_LIMITER : env.WHEEL_RATE_LIMITER;
  if (!limiter) return false;
  try {
    const { success } = await limiter.limit({ key: `${kind}:${clientKey ?? "unknown"}` });
    return !success;
  } catch {
    return false;
  }
}

export function tooMany(c: Context<{ Bindings: Bindings }>): Response {
  c.header("retry-after", String(RATE_LIMIT_RETRY_SECONDS));
  return c.json({ error: "rate_limited" }, 429);
}

/**
 * Same-origin defence in depth. The guest token is a header, not a cookie, so there
 * is no ambient credential to forge; this still rejects cross-site posts outright.
 */
export function originAllowed(
  env: Bindings,
  origin: string | undefined,
  requestUrl: string,
): boolean {
  if (!origin) return true;
  if (origin === SITE_ORIGIN) return true;
  try {
    if (new URL(origin).origin === new URL(requestUrl).origin) return true;
  } catch {
    return false;
  }
  // Local tooling only: `npm run dev:web` proxies from the Vite dev server.
  if (env.APP_ENV !== "production" && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
    return true;
  }
  return false;
}

function wheelDto(catalog: WheelCatalog) {
  return {
    id: catalog.wheel.id,
    version: catalog.wheel.version,
    title: catalog.wheel.title,
    tagline: catalog.wheel.tagline,
    drawMode: catalog.wheel.drawMode,
  };
}

function categoryTitle(catalog: WheelCatalog, id: string): string {
  return catalog.categories.find((category) => category.id === id)?.title ?? "Discovery";
}

interface ModeExtras {
  partner?: Activity | null;
  dealerCategory?: { id: string; title: string } | null;
  combinedMinutes?: number | null;
}

function resultResponse(
  request: SpinRequest,
  catalog: WheelCatalog,
  session: GuestSession,
  plan: { winner: Activity; segments: Activity[]; selectedIndex: number },
  eligibleCount: number,
  replayed: boolean,
  extras: ModeExtras = {},
): SpinResponse {
  return {
    status: "result",
    spinId: request.idempotencyKey,
    replayed,
    guest: { id: session.id, expiresAt: session.expiresAt },
    catalogRevision: catalog.revision,
    wheel: wheelDto(catalog),
    shortlist: toSegmentDtos(plan),
    selectedIndex: plan.selectedIndex,
    eligibleCount,
    repeatPolicy: request.repeatPolicy,
    result: toResultDto(plan.winner, catalog.categories),
    partner: extras.partner ? toResultDto(extras.partner, catalog.categories) : null,
    dealerCategory: extras.dealerCategory ?? null,
    combinedMinutes: extras.combinedMinutes ?? null,
  };
}

function emptyResponse(
  request: SpinRequest,
  catalog: WheelCatalog,
  session: GuestSession,
): SpinResponse {
  return {
    status: "empty",
    guest: { id: session.id, expiresAt: session.expiresAt },
    catalogRevision: catalog.revision,
    wheel: wheelDto(catalog),
    eligibleCount: 0,
    hints: emptyHints(catalog.activities, request),
    message:
      catalog.wheel.drawMode === "pair"
        ? "No compatible pair fits those boundaries and that time budget. Nothing was loosened for you — adjust a limit and spin again."
        : "Nothing fits those boundaries exactly. Nothing was loosened for you — adjust a limit and spin again.",
  };
}

/** Rebuilds a wheel around an already-decided result without re-drawing the winner. */
function replayPlan(catalog: WheelCatalog, activity: Activity) {
  return shortlistAround(catalog.activities, activity, {
    shortlistSize: catalog.wheel.shortlistSize,
  });
}

/** Replays a stored spin without re-drawing, including pair and dealer context. */
function replayResponse(
  request: SpinRequest,
  catalog: WheelCatalog,
  session: GuestSession,
  spin: SpinRecord,
  eligibleCount: number,
): SpinResponse | null {
  // Publication and eligibility may have changed since the original draw.
  catalog = {
    ...catalog,
    activities: eligibleActivities(catalog.activities, toEligibilityContext(request)),
  };
  const winner = winnerFrom(catalog, spin);
  if (!winner) return null;
  const partner = spin.companionActivityId
    ? (catalog.activities.find(
        (entry) =>
          entry.id === spin.companionActivityId && entry.version === spin.companionActivityVersion,
      ) ?? null)
    : null;
  if (
    catalog.wheel.drawMode === "pair" &&
    (!partner ||
      winner.id === partner.id ||
      winner.incompatibleWith.includes(partner.id) ||
      partner.incompatibleWith.includes(winner.id) ||
      winner.durationMinutes + partner.durationMinutes > minutesOf(request.duration))
  )
    return null;
  return resultResponse(
    request,
    catalog,
    session,
    replayPlan(catalog, winner),
    eligibleCount,
    true,
    {
      partner,
      dealerCategory:
        catalog.wheel.drawMode === "category"
          ? { id: winner.category, title: categoryTitle(catalog, winner.category) }
          : null,
      combinedMinutes: partner ? winner.durationMinutes + partner.durationMinutes : null,
    },
  );
}

function winnerFrom(catalog: WheelCatalog, spin: SpinRecord): Activity | null {
  if (spin.wheelId !== catalog.wheel.id || spin.wheelVersion !== catalog.wheel.version) return null;
  const activity = catalog.activities.find(
    (entry) => entry.id === spin.activityId && entry.version === spin.activityVersion,
  );
  return activity ?? null;
}

/** Public wheel directory. Contains no activity content, only presentation and counts. */
wheelRoutes.get("/wheels", async (c) => {
  if (!c.env?.DB) return c.json({ error: "unavailable" }, 503);
  if (await rateLimited(c.env, "wheel", c.req.header("cf-connecting-ip"))) return tooMany(c);
  try {
    const wheels = await listPublicWheels(c.env.DB);
    return c.json({
      wheels,
      disclosure: {
        promptNotConsent: true,
        note: "Every mode is a discovery prompt. A spin is never permission or a partner's approval.",
      },
    });
  } catch {
    return c.json({ error: "unavailable" }, 503);
  }
});

wheelRoutes.get("/wheels/:wheel", async (c) => {
  if (!c.env?.DB) return c.json({ error: "unavailable" }, 503);
  if (await rateLimited(c.env, "wheel", c.req.header("cf-connecting-ip"))) return tooMany(c);
  const wheelId = c.req.param("wheel");
  if (!(PUBLIC_WHEEL_IDS as readonly string[]).includes(wheelId))
    return c.json({ error: "not_found" }, 404);
  let catalog: WheelCatalog | null;
  try {
    catalog = await loadWheelCatalog(c.env.DB, wheelId);
  } catch {
    return c.json({ error: "unavailable" }, 503);
  }
  if (!catalog) return c.json({ error: "not_found" }, 404);

  const byHeat: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0 };
  for (const activity of catalog.activities) {
    byHeat[String(activity.heat)] = (byHeat[String(activity.heat)] ?? 0) + 1;
  }
  const config: WheelConfigDto = {
    wheel: {
      id: catalog.wheel.id,
      version: catalog.wheel.version,
      title: catalog.wheel.title,
      tagline: catalog.wheel.tagline,
      description: catalog.wheel.description,
      shortlistSize: catalog.wheel.shortlistSize,
      selectionPolicy: catalog.wheel.selectionPolicy,
      drawMode: catalog.wheel.drawMode,
    },
    catalogRevision: catalog.revision,
    counts: { total: catalog.activities.length, byHeat },
    categories: catalog.categories.map((category) => ({ ...category })),
    supplies: catalog.supplies.map((supply) => ({ ...supply })),
    options: {
      heat: HEAT_OPTIONS.map((option) => ({
        key: option.key,
        label: option.label,
        level: option.level,
        note: option.note,
        available: (byHeat[String(option.level)] ?? 0) > 0,
      })),
      experimentation: EXPERIMENTATION_OPTIONS.map((option) => ({ ...option })),
      energy: ENERGY_OPTIONS.map((option) => ({ ...option })),
      duration: DURATION_OPTIONS.map((option) => ({
        key: option.key,
        label: option.label,
        minutes: option.minutes,
      })),
      environment: ENVIRONMENT_OPTIONS.map((option) => ({ ...option })),
    },
    disclosure: {
      promptNotConsent: true,
      note: "A spin supplies a topic to discuss. It is never permission, an obligation or a dare anyone owes.",
    },
  };
  return c.json(config);
});

function weightOf(catalog: WheelCatalog, activity: Activity): number {
  if (catalog.wheel.selectionPolicy === "uniform") return 1;
  return catalog.weights[activity.id] ?? 1;
}

wheelRoutes.post("/spins", async (c) => {
  const env = c.env;
  if (!env?.DB) return c.json({ error: "unavailable" }, 503);
  // Fail closed, before any guest row is read or written: without a valid key there is no
  // fingerprint, and an unkeyed one would expose the boundary configuration to a database
  // reader. The error stays generic and never echoes configuration or key material.
  if (!requestDigestKeyed(env.SPIN_DIGEST_KEY)) return c.json({ error: "unavailable" }, 503);
  if (await rateLimited(env, "spin", c.req.header("cf-connecting-ip"))) return tooMany(c);
  if (!originAllowed(env, c.req.header("origin"), c.req.url)) {
    return c.json({ error: "origin_rejected" }, 403);
  }
  if ((c.req.header("sec-fetch-site") ?? "") === "cross-site") {
    return c.json({ error: "origin_rejected" }, 403);
  }
  const contentType = (c.req.header("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    return c.json({ error: "unsupported_media_type" }, 415);
  }
  let body: unknown;
  try {
    const raw = await boundedText(c.req.raw, MAX_BODY_BYTES);
    if (raw === null) return c.json({ error: "payload_too_large" }, 413);
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: "invalid_request" }, 422);
  }
  const parsed = spinRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_request" }, 422);
  const request = parsed.data;

  let catalog: WheelCatalog | null;
  try {
    catalog = await loadWheelCatalog(env.DB, request.wheelId);
  } catch {
    return c.json({ error: "unavailable" }, 503);
  }
  if (!catalog) return c.json({ error: "not_found" }, 404);

  // Unknown category/supply ids are rejected: they can only come from a tampered or
  // stale client, and silently ignoring them would make the menu a lie.
  const categoryIds = new Set(catalog.categories.map((category) => category.id));
  const supplyIds = new Set(catalog.supplies.map((supply) => supply.id));
  const unknown =
    request.optIns.some((id) => !categoryIds.has(id)) ||
    request.excludedCategories.some((id) => !categoryIds.has(id)) ||
    request.supplies.some((id) => !supplyIds.has(id));
  if (unknown) return c.json({ error: "invalid_request" }, 422);

  const now = Math.floor(Date.now() / 1000);
  const presented = c.req.header("x-cheapseggs-guest");
  if (!presented || !GUEST_TOKEN.test(presented)) {
    return c.json({ error: "guest_session_required" }, 400);
  }
  const session = await ensureGuestSession(env.DB, presented, now);
  if (!session) return c.json({ error: "guest_session_required" }, 400);
  try {
    await purgeExpired(env.DB, now);
  } catch {
    // Cleanup is best effort; never fail a valid spin because a purge batch failed.
  }

  const fingerprint = await requestDigest(env.SPIN_DIGEST_KEY, canonicalRequest(request));
  const existing = await findSpin(env.DB, request.idempotencyKey);
  if (existing) {
    if (existing.sessionId !== session.id || existing.requestDigest !== fingerprint) {
      return c.json({ error: "spin_conflict" }, 409);
    }
    // A replay must not bypass withdrawal: the stored result has to still be current.
    const replayed = replayResponse(request, catalog, session, existing, 1);
    if (!replayed) return c.json({ error: "spin_invalidated" }, 409);
    return c.json(replayed, 200);
  }

  if ((await countSessionSpins(env.DB, session.id)) >= MAX_SPINS_PER_SESSION) {
    return c.json({ error: "guest_budget_exhausted" }, 429);
  }

  const context = toEligibilityContext(request);
  const eligible = eligibleActivities(catalog.activities, context);
  if (eligible.length === 0) return c.json(emptyResponse(request, catalog, session), 200);

  const recent =
    request.repeatPolicy === "avoid-recent"
      ? await recentActivityIds(env.DB, session.id)
      : new Set<string>();
  const pool = candidatePool(eligible, recent, request.repeatPolicy);
  const weighted = (activities: readonly Activity[]) =>
    activities.map((activity) => ({
      activity,
      weight: weightOf(catalog as WheelCatalog, activity),
    }));

  let plan: SpinPlan | null = null;
  let partner: Activity | null = null;
  let dealer: DealerChoice | null = null;
  if (catalog.wheel.drawMode === "pair") {
    const pair = planPairSpin(weighted(pool), minutesOf(request.duration), {
      shortlistSize: catalog.wheel.shortlistSize,
    });
    if (pair) {
      plan = pair;
      partner = pair.companion;
    }
  } else if (catalog.wheel.drawMode === "category") {
    dealer = dealerChoice(pool);
    if (dealer) {
      plan = planSpin(weighted(dealer.activities), {
        shortlistSize: catalog.wheel.shortlistSize,
      });
    }
  } else {
    plan = planSpin(weighted(pool), { shortlistSize: catalog.wheel.shortlistSize });
  }
  if (!plan) return c.json(emptyResponse(request, catalog, session), 200);

  const expiresAt = Math.min(now + GUEST_TTL_SECONDS, session.expiresAt);
  const inserted = await insertSpin(
    env.DB,
    {
      id: request.idempotencyKey,
      sessionId: session.id,
      requestDigest: fingerprint,
      wheelId: catalog.wheel.id,
      wheelVersion: catalog.wheel.version,
      activityId: plan.winner.id,
      activityVersion: plan.winner.version,
      companionActivityId: partner?.id ?? null,
      companionActivityVersion: partner?.version ?? null,
      catalogRevision: catalog.revision,
      expiresAt,
    },
    now,
  );
  if (!inserted) {
    // Concurrent duplicate: the first writer wins and both callers see one result.
    const raced = await findSpin(env.DB, request.idempotencyKey);
    if (!raced || raced.sessionId !== session.id || raced.requestDigest !== fingerprint) {
      return c.json({ error: "spin_conflict" }, 409);
    }
    const replayed = replayResponse(request, catalog, session, raced, eligible.length);
    if (!replayed) return c.json({ error: "spin_invalidated" }, 409);
    return c.json(replayed, 200);
  }

  return c.json(
    resultResponse(request, catalog, session, plan, eligible.length, false, {
      partner,
      dealerCategory: dealer
        ? { id: dealer.category, title: categoryTitle(catalog, dealer.category) }
        : null,
      combinedMinutes: partner ? plan.winner.durationMinutes + partner.durationMinutes : null,
    }),
    200,
  );
});

/** Explicit reset: the only way guest state is deleted before its 24h expiry. */
wheelRoutes.delete("/guest", async (c) => {
  const env = c.env;
  const presented = c.req.header("x-cheapseggs-guest");
  if (env?.DB && presented && GUEST_TOKEN.test(presented)) {
    try {
      await deleteGuestSession(env.DB, presented);
    } catch {
      // Reset is idempotent; an unavailable database simply leaves nothing to delete.
    }
  }
  return c.body(null, 204);
});
