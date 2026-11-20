import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { PUBLIC_PATHS, SITE_JSON_LD_HASH, SITE_ORIGIN } from "../config/site";

type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV: string;
  DEPLOY_REVISION?: string;
  WORKER_VERSION?: { id: string; tag: string; timestamp: string };
};
export const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", SITE_JSON_LD_HASH],
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      connectSrc: ["'self'", "https://analytics.aismallbizguru.com"],
      objectSrc: ["'none'"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
    referrerPolicy: "no-referrer",
    xFrameOptions: "DENY",
  }),
);
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("X-CheapSeggs-Revision", c.env?.DEPLOY_REVISION ?? "local");
  if (
    c.env?.APP_ENV === "production" &&
    !["cheapseggs.com", "www.cheapseggs.com"].includes(url.hostname)
  ) {
    c.header("Cache-Control", "no-store");
    c.header("X-Robots-Tag", "noindex, nofollow");
    return c.json({ error: "not_found" }, 404);
  }
  if (url.protocol === "https:") c.header("Strict-Transport-Security", "max-age=31536000");
  if (/^\/(api|play|account|auth|invite|assessments|results)(\/|$)/.test(url.pathname)) {
    c.header("Cache-Control", "no-store");
    c.header("X-Robots-Tag", "noindex, nofollow");
  }
  if (url.hostname === "www.cheapseggs.com") {
    if (c.req.method !== "GET" && c.req.method !== "HEAD")
      return c.json({ error: "canonical_origin_required" }, 400);
    return c.redirect(`${SITE_ORIGIN}${url.pathname}${url.search}`, 308);
  }
  if (c.req.method === "GET" || c.req.method === "HEAD") {
    const canonical =
      url.pathname === "/index.html"
        ? "/"
        : PUBLIC_PATHS.find(
            (path) =>
              path !== "/" &&
              [path.slice(0, -1), `${path}index.html`, `${path.slice(0, -1)}.html`].includes(
                url.pathname,
              ),
          );
    if (canonical) return c.redirect(`${canonical}${url.search}`, 308);
    if (url.pathname === "/play") return c.redirect(`/play/${url.search}`, 308);
  }
  await next();
  // Raw asset Responses replace prepared headers; attach release identity after dispatch.
  c.header("X-CheapSeggs-Revision", c.env?.DEPLOY_REVISION ?? "local");
  if (/^\/(api|play|account|auth|invite|assessments|results)(\/|$)/.test(url.pathname)) {
    c.header("Cache-Control", "no-store");
  }
  if (c.res.status >= 400 || !(PUBLIC_PATHS as readonly string[]).includes(url.pathname)) {
    c.header("X-Robots-Tag", "noindex, nofollow");
  }
});
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  await next();
});

app.get("/api/health", (c) => c.json({ status: "ok", service: "cheapseggs", stage: "foundation" }));
app.get("/api/version", (c) =>
  c.json({
    service: "cheapseggs",
    revision: c.env?.DEPLOY_REVISION ?? "local",
    workerVersion: c.env?.WORKER_VERSION?.id ?? null,
    environment: c.env?.APP_ENV ?? "local",
  }),
);
app.get("/api/ready", async (c) => {
  try {
    await c.env.DB.prepare("SELECT activity_id FROM activity_versions LIMIT 1").first();
    return c.json({ status: "ready" });
  } catch {
    return c.json({ status: "unavailable" }, 503);
  }
});
app.get("/api/v1/catalog/preview", async (c) => {
  // Only designated non-intimate sample rows. Real catalog access needs adult-access policy.
  const { results } = await c.env.DB.prepare(
    `SELECT activity_id AS id, version, title, description, duration_minutes AS durationMinutes
     FROM activity_versions
     WHERE public_preview = 1 AND status = 'published' AND pack_id IS NULL
     ORDER BY activity_id LIMIT 12`,
  ).all();
  return c.json({ items: results, catalogVersion: "sample-1" });
});
app.all("/api/auth/*", (c) => c.json({ error: "auth_not_configured" }, 503));
app.all("/api/payments/*", (c) => c.json({ error: "payments_not_configured" }, 503));
app.get("*", async (c) => {
  const pathname = new URL(c.req.url).pathname;
  if (
    pathname.startsWith("/api/") ||
    /^\/(account|auth|invite|assessments|results)(\/|$)/.test(pathname)
  ) {
    return c.json({ error: "not_found" }, 404);
  }
  if (!c.env?.ASSETS) return c.json({ error: "not_found" }, 404);
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  // Asset-service headers are immutable; clone before security/indexing middleware runs.
  return new Response(asset.body, asset);
});
app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((_error, c) => c.json({ error: "request_failed" }, 500));

export default app;
