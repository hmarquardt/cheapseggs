import { Hono } from "hono";
import { toRecipeDetail, toRecipeSummary } from "../services/recipe-dto";
import { loadRecipes } from "../services/recipes";
import { digest } from "../services/wheel";
import type { Bindings } from "./bindings";
import { rateLimited, tooMany } from "./wheel";

export const recipeRoutes = new Hono<{ Bindings: Bindings }>();

export async function recipeRevision(
  recipes: Awaited<ReturnType<typeof loadRecipes>>,
): Promise<string> {
  const canonical = JSON.stringify({
    recipes: recipes.recipes.map((recipe) => `${recipe.id}@${recipe.version}`).sort(),
    activities: [...recipes.activities.keys()].sort(),
  });
  return `cookbook+${(await digest(canonical)).slice(0, 16)}`;
}

recipeRoutes.get("/recipes", async (c) => {
  if (!c.env?.DB) return c.json({ error: "unavailable" }, 503);
  if (await rateLimited(c.env, "wheel", c.req.header("cf-connecting-ip"))) return tooMany(c);
  try {
    const catalog = await loadRecipes(c.env.DB);
    return c.json({
      recipes: catalog.recipes.map((recipe) => toRecipeSummary(recipe, catalog.categories)),
      catalogRevision: await recipeRevision(catalog),
      disclosure: {
        promptNotConsent: true,
        note: "A recipe is a suggested evening to talk about, not a script either of you owes the other.",
      },
    });
  } catch {
    return c.json({ error: "unavailable" }, 503);
  }
});

recipeRoutes.get("/recipes/:id", async (c) => {
  if (!c.env?.DB) return c.json({ error: "unavailable" }, 503);
  if (await rateLimited(c.env, "wheel", c.req.header("cf-connecting-ip"))) return tooMany(c);
  const id = c.req.param("id");
  if (!/^[a-z0-9-]{1,60}$/.test(id)) return c.json({ error: "not_found" }, 404);
  try {
    const catalog = await loadRecipes(c.env.DB);
    const recipe = catalog.recipes.find((entry) => entry.id === id);
    if (!recipe) return c.json({ error: "not_found" }, 404);
    const detail = toRecipeDetail(recipe, catalog.activities, catalog.categories);
    if (!detail) return c.json({ error: "not_found" }, 404);
    return c.json({
      recipe: detail,
      catalogRevision: await recipeRevision(catalog),
      disclosure: {
        promptNotConsent: true,
        note: "Substitutions are alternative suggestions, not permission for anything else.",
      },
    });
  } catch {
    return c.json({ error: "unavailable" }, 503);
  }
});
