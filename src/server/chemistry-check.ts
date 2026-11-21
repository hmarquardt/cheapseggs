import { Hono } from "hono";
import { z } from "zod";
import { type ChemistryDepth, DIMENSIONS } from "../content/chemistry/questions";
import { accountOrigin, currentAccount } from "../services/account";
import {
  acceptInvitation,
  adultDeclared,
  approveRelease,
  assessmentAndParticipant,
  chemistryKeyring,
  chemistryPrivateEnabled,
  createAssessment,
  declineAssessment,
  listOwnAssessments,
  MAX_REQUEST_BYTES,
  ownAssessmentView,
  parseSubmissionPayload,
  purgeExpired,
  readDraft,
  readReleasedReport,
  releaseAssessment,
  revokeInvitation,
  saveDraft,
  submitAssessment,
  takeChemistryBudget,
  withdrawAssessment,
} from "../services/chemistry-check";
import type { ChemistryKeyring } from "../services/chemistry-envelope";
import type { Bindings } from "./bindings";
import { boundedText } from "./body";

type ChemistryEnv = {
  Bindings: Bindings;
  Variables: { chemistryKeyring: ChemistryKeyring };
};

export const chemistryRoutes = new Hono<ChemistryEnv>();

const dimensionIds = DIMENSIONS.map((dimension) => dimension.id) as [string, ...string[]];
const depthSchema = z.union([z.literal(25), z.literal(50), z.literal(100)]);
const createSchema = z
  .object({ depth: depthSchema, inviteeLabel: z.string().trim().min(1).max(40) })
  .strict();
const tokenSchema = z
  .object({
    token: z.string().min(32).max(128),
    confirmLabel: z.string().trim().min(1).max(40),
  })
  .strict();
const submissionBodySchema = z.object({ submission: z.unknown() }).strict();
const approvalSchema = z
  .object({
    dimensions: z.array(z.enum(dimensionIds)).min(1).max(DIMENSIONS.length),
    intimacyShared: z.boolean(),
    hardSignal: z.boolean(),
  })
  .strict();

const NOT_FOUND = { error: "not_found" } as const;
function revocationRequest(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return (
    (request.method === "POST" &&
      /^\/api\/v1\/chemistry-check\/assessments\/[0-9a-f-]{36}\/(withdraw|decline|invitation\/revoke)$/.test(
        path,
      )) ||
    (request.method === "DELETE" &&
      /^\/api\/v1\/chemistry-check\/assessments\/[0-9a-f-]{36}$/.test(path))
  );
}

/** All private routes fail closed and indistinguishably when the gate or key is absent. */
chemistryRoutes.use("/chemistry-check/*", async (c, next) => {
  if (!c.env || !chemistryPrivateEnabled(c.env)) return c.json(NOT_FOUND, 404);
  const keyring = await chemistryKeyring(c.env);
  if (!keyring) return c.json(NOT_FOUND, 404);
  if (c.req.method !== "GET") {
    const site = c.req.header("sec-fetch-site");
    if (
      c.req.header("origin") !== accountOrigin(c.env) ||
      (site && site !== "same-origin") ||
      c.req.header("content-type")?.split(";")[0] !== "application/json" ||
      c.req.header("x-cheapseggs-action") !== "chemistry"
    )
      return c.json({ error: "request_not_allowed" }, 403);
  }
  const address = c.env.APP_ENV === "production" ? c.req.header("cf-connecting-ip") : "local";
  if (!address) return c.json({ error: "unavailable" }, 503);
  if (
    !revocationRequest(c.req.raw) &&
    !(await takeChemistryBudget(c.env, "request", address, 240, 900))
  ) {
    c.header("retry-after", "900");
    return c.json({ error: "rate_limited" }, 429);
  }
  c.set("chemistryKeyring", keyring);
  await next();
});
chemistryRoutes.use("/chemistry-check/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  await next();
});

type Actor =
  | { userId: string; sessionId: string }
  | {
      error: "sign_in_required" | "adult_declaration_required" | "rate_limited";
      status: 401 | 403 | 429;
    };

async function actor(request: Request, env: Bindings, now: number): Promise<Actor> {
  const account = await currentAccount(env, request);
  if (!account) return { error: "sign_in_required", status: 401 };
  if (revocationRequest(request)) return { userId: account.ownerId, sessionId: account.session.id };
  if (!(await adultDeclared(env, account.ownerId, now)))
    return { error: "adult_declaration_required", status: 403 };
  if (!(await takeChemistryBudget(env, "account-request", account.ownerId, 240, 900)))
    return { error: "rate_limited", status: 429 };
  await purgeExpired(env, now).catch(() => undefined);
  return { userId: account.ownerId, sessionId: account.session.id };
}

async function body<T>(
  request: Request,
  schema: z.ZodType<T>,
  maximum = MAX_REQUEST_BYTES,
): Promise<T | null> {
  const text = await boundedText(request, maximum);
  if (text === null || text.length === 0) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

chemistryRoutes.get("/chemistry-check/status", (c) => c.json({ available: true }));

chemistryRoutes.post("/chemistry-check/assessments", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const who = await actor(c.req.raw, c.env, now);
  if ("error" in who) return c.json({ error: who.error }, who.status);
  const parsed = await body(c.req.raw, createSchema);
  if (!parsed) return c.json({ error: "invalid_request" }, 400);
  const created = await createAssessment(
    c.env,
    who.userId,
    parsed.depth as ChemistryDepth,
    parsed.inviteeLabel,
    now,
    who.sessionId,
  );
  if (!created) return c.json({ error: "not_available" }, 409);
  return c.json(
    {
      assessment: created.assessment,
      invitation: {
        token: created.invitation.token,
        hashPath: `#invite=${created.invitation.token}`,
        inviteeLabel: created.invitation.inviteeLabel,
        expiresAt: created.invitation.expiresAt,
      },
    },
    201,
  );
});

chemistryRoutes.get("/chemistry-check/assessments", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const who = await actor(c.req.raw, c.env, now);
  if ("error" in who) return c.json({ error: who.error }, who.status);
  return c.json({ assessments: await listOwnAssessments(c.env, who.userId, now) });
});

chemistryRoutes.get("/chemistry-check/assessments/:id", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const who = await actor(c.req.raw, c.env, now);
  if ("error" in who) return c.json({ error: who.error }, who.status);
  const found = await assessmentAndParticipant(c.env, c.req.param("id"), who.userId);
  if (!found) return c.json(NOT_FOUND, 404);
  return c.json({
    assessment: await ownAssessmentView(c.env, found.assessment, found.participant, now),
  });
});

chemistryRoutes.get("/chemistry-check/assessments/:id/draft", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const who = await actor(c.req.raw, c.env, now);
  if ("error" in who) return c.json({ error: who.error }, who.status);
  const submission = await readDraft(
    c.env,
    c.get("chemistryKeyring"),
    c.req.param("id"),
    who.userId,
    who.sessionId,
  );
  if (!submission) return c.json(NOT_FOUND, 404);
  return c.json({ submission });
});

chemistryRoutes.put("/chemistry-check/assessments/:id/draft", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const who = await actor(c.req.raw, c.env, now);
  if ("error" in who) return c.json({ error: who.error }, who.status);
  const parsed = await body(c.req.raw, submissionBodySchema);
  if (!parsed) return c.json({ error: "invalid_request" }, 400);
  const submission = parseSubmissionPayload(parsed.submission);
  if (!submission) return c.json({ error: "invalid_request" }, 400);
  const revision = await saveDraft(
    c.env,
    c.get("chemistryKeyring"),
    c.req.param("id"),
    who.userId,
    submission,
    now,
    who.sessionId,
  );
  if (revision === null) return c.json(NOT_FOUND, 404);
  return c.json({ revision });
});

chemistryRoutes.post("/chemistry-check/assessments/:id/submission", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const who = await actor(c.req.raw, c.env, now);
  if ("error" in who) return c.json({ error: who.error }, who.status);
  const parsed = await body(c.req.raw, submissionBodySchema);
  if (!parsed) return c.json({ error: "invalid_request" }, 400);
  const submission = parseSubmissionPayload(parsed.submission);
  if (!submission) return c.json({ error: "invalid_request" }, 400);
  const revision = await submitAssessment(
    c.env,
    c.get("chemistryKeyring"),
    c.req.param("id"),
    who.userId,
    submission,
    now,
    who.sessionId,
  );
  if (revision === null) return c.json(NOT_FOUND, 404);
  return c.json({ revision });
});

chemistryRoutes.post("/chemistry-check/assessments/:id/approval", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const who = await actor(c.req.raw, c.env, now);
  if ("error" in who) return c.json({ error: who.error }, who.status);
  const parsed = await body(c.req.raw, approvalSchema);
  if (!parsed) return c.json({ error: "invalid_request" }, 400);
  const view = await approveRelease(
    c.env,
    c.req.param("id"),
    who.userId,
    parsed,
    now,
    who.sessionId,
  );
  if (!view) return c.json({ error: "not_ready" }, 409);
  return c.json({ assessment: view });
});

chemistryRoutes.post("/chemistry-check/assessments/:id/release", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const who = await actor(c.req.raw, c.env, now);
  if ("error" in who) return c.json({ error: who.error }, who.status);
  if (!(await takeChemistryBudget(c.env, "release", who.userId, 30, 3600))) {
    c.header("retry-after", "3600");
    return c.json({ error: "rate_limited" }, 429);
  }
  const released = await releaseAssessment(
    c.env,
    c.get("chemistryKeyring"),
    c.req.param("id"),
    who.userId,
    now,
    who.sessionId,
  );
  if (!released) return c.json({ error: "not_ready" }, 409);
  return c.json(released);
});

chemistryRoutes.get("/chemistry-check/assessments/:id/report", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const who = await actor(c.req.raw, c.env, now);
  if ("error" in who) return c.json({ error: who.error }, who.status);
  const released = await readReleasedReport(
    c.env,
    c.get("chemistryKeyring"),
    c.req.param("id"),
    who.userId,
    now,
    who.sessionId,
  );
  if (!released) return c.json(NOT_FOUND, 404);
  return c.json(released);
});

chemistryRoutes.post("/chemistry-check/assessments/:id/withdraw", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const who = await actor(c.req.raw, c.env, now);
  if ("error" in who) return c.json({ error: who.error }, who.status);
  const ok = await withdrawAssessment(c.env, c.req.param("id"), who.userId, now, "withdrawn");
  if (!ok) return c.json(NOT_FOUND, 404);
  return c.json({ ok: true });
});

chemistryRoutes.delete("/chemistry-check/assessments/:id", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const who = await actor(c.req.raw, c.env, now);
  if ("error" in who) return c.json({ error: who.error }, who.status);
  const ok = await withdrawAssessment(c.env, c.req.param("id"), who.userId, now, "deleted");
  if (!ok) return c.json(NOT_FOUND, 404);
  return c.json({ ok: true });
});

chemistryRoutes.post("/chemistry-check/invitations/accept", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const who = await actor(c.req.raw, c.env, now);
  if ("error" in who) return c.json({ error: who.error }, who.status);
  const parsed = await body(c.req.raw, tokenSchema, 4096);
  if (!parsed) return c.json({ error: "invalid_request" }, 400);
  const accepted = await acceptInvitation(
    c.env,
    parsed.token,
    parsed.confirmLabel,
    who.userId,
    now,
    who.sessionId,
  );
  if (!accepted) return c.json(NOT_FOUND, 404);
  return c.json({ assessmentId: accepted.assessmentId });
});

chemistryRoutes.post("/chemistry-check/assessments/:id/decline", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const who = await actor(c.req.raw, c.env, now);
  if ("error" in who) return c.json({ error: who.error }, who.status);
  const ok = await declineAssessment(c.env, c.req.param("id"), who.userId, now);
  if (!ok) return c.json(NOT_FOUND, 404);
  return c.json({ ok: true });
});

chemistryRoutes.post("/chemistry-check/assessments/:id/invitation/revoke", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const who = await actor(c.req.raw, c.env, now);
  if ("error" in who) return c.json({ error: who.error }, who.status);
  const ok = await revokeInvitation(c.env, c.req.param("id"), who.userId, now);
  if (!ok) return c.json(NOT_FOUND, 404);
  return c.json({ ok: true });
});
