import { Hono } from "hono";
import { currentAccount } from "../services/account";
import { ADULT_CONTENT_GATES } from "../services/age-assurance";
import { ADULT_POLICY } from "../services/auth";
import { type ContentAccessRule, contentAllowed } from "../services/content-access";
import type { Bindings } from "./bindings";

export const contentRoutes = new Hono<{ Bindings: Bindings }>();
contentRoutes.get("/content/:id/:version", async (c) => {
  const id = c.req.param("id");
  const version = Number(c.req.param("version"));
  if (!/^[a-z0-9-]{1,80}$/.test(id) || !Number.isSafeInteger(version) || version < 1)
    return c.json({ error: "not_found" }, 404);
  const row = await c.env.DB.prepare(`SELECT av.*, c.required_opt_in FROM activity_versions av
    JOIN categories c ON c.id = av.category_id WHERE av.activity_id = ? AND av.version = ?`)
    .bind(id, version)
    .first<{
      title: string;
      description: string;
      access_tier: ContentAccessRule["tier"];
      status: string;
      category_id: string;
      required_opt_in: number;
      pack_id: string | null;
    }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  // Restricted material is globally closed, including to authenticated or database-marked adults.
  if (row.access_tier !== "public_preview" && !ADULT_CONTENT_GATES.legalMarketsApproved)
    return c.json({ error: "not_found" }, 404);
  const account = await currentAccount(c.env, c.req.raw);
  const now = Math.floor(Date.now() / 1000);
  const declaration = account
    ? await c.env.DB.prepare(
        "SELECT expires_at FROM account_declarations WHERE user_id = ? AND policy_version = ?",
      )
        .bind(account.ownerId, ADULT_POLICY)
        .first<{ expires_at: number }>()
    : null;
  const categories = account
    ? await c.env.DB.prepare(
        "SELECT category_id FROM account_category_approvals WHERE user_id = ? AND policy_version = ?",
      )
        .bind(account.ownerId, ADULT_POLICY)
        .all<{ category_id: string }>()
    : { results: [] };
  const permitted = contentAllowed(
    {
      tier: row.access_tier,
      published: row.status === "published",
      category: row.category_id,
      categoryOptInRequired: row.required_opt_in === 1,
      activityId: id,
      version,
      packId: row.pack_id,
    },
    {
      userId: account?.user.id ?? null,
      registered: Boolean(account),
      selfDeclaredAdult: Boolean(declaration && declaration.expires_at > now),
      verification: null,
      approvedCategories: categories.results.map((entry) => entry.category_id),
      activityApproval: null,
      entitledPackIds: [],
    },
    {
      approved: false,
      requiresVerification: true,
      jurisdictionPolicy: "unapproved",
      assurancePolicy: "unapproved",
      assuranceEnabled: false,
    },
    now,
  );
  if (!permitted) return c.json({ error: "not_found" }, 404);
  return c.json({ id, version, title: row.title, description: row.description });
});
