import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

type Bindings = { DB: D1Database; ASSETS: Fetcher; APP_ENV: string };
export const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
    referrerPolicy: "no-referrer",
  }),
);
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  await next();
});

app.get("/api/health", (c) => c.json({ status: "ok", service: "cheapseggs", stage: "foundation" }));
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
app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((_error, c) => c.json({ error: "request_failed" }, 500));

export default app;
