import { render } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
import type { RecipeDetailDto, RecipeSummaryDto } from "../../services/recipe-dto";
import { ApiError, loadRecipe, loadRecipes } from "../api";
import "../styles.css";

const HEAT_LABEL = ["Mild", "Medium", "Spicy", "Habanero"];
const MOOD_LABEL: Record<string, string> = {
  romantic: "Romantic",
  playful: "Playful",
  adventurous: "Adventurous",
};
const MOODS = ["all", "romantic", "playful", "adventurous"] as const;

function heatText(min: number, max: number): string {
  if (min === max) return HEAT_LABEL[min] ?? "Unrated";
  return `${HEAT_LABEL[min] ?? "Mild"} to ${HEAT_LABEL[max] ?? "Spicy"}`;
}

function RecipeCard({ recipe, onOpen }: { recipe: RecipeSummaryDto; onOpen: () => void }) {
  return (
    <article class="recipe-card">
      <p class="pill">{MOOD_LABEL[recipe.mood] ?? recipe.mood}</p>
      <h3>{recipe.title}</h3>
      <p class="recipe-subtitle">{recipe.subtitle}</p>
      <p class="recipe-intro">{recipe.intro}</p>
      <ul class="meta-chips" aria-label="Recipe details">
        <li class="meta-chip">{heatText(recipe.heatRange.min, recipe.heatRange.max)}</li>
        <li class="meta-chip">
          {recipe.duration.minimumMinutes}–{recipe.duration.maximumMinutes} min
        </li>
        <li class="meta-chip">
          {recipe.stepCount} {recipe.stepCount === 1 ? "step" : "steps"}
        </li>
      </ul>
      {recipe.supplies.length > 0 && (
        <p class="small-note">
          Ingredients: {recipe.supplies.map((supply) => supply.title).join(", ")}
        </p>
      )}
      <button type="button" class="button button-outline button-small" onClick={onOpen}>
        Open the recipe
      </button>
    </article>
  );
}

function RecipeDetail({ recipe, onBack }: { recipe: RecipeDetailDto; onBack: () => void }) {
  return (
    <article class="recipe-detail" aria-labelledby="recipe-title">
      <button type="button" class="text-button" onClick={onBack}>
        ← Back to the cookbook
      </button>
      <p class="eyebrow">
        THE COOKBOOK · {MOOD_LABEL[recipe.mood]?.toUpperCase() ?? recipe.mood.toUpperCase()}
      </p>
      <h1 id="recipe-title" tabIndex={-1}>
        {recipe.title}
      </h1>
      <p class="plan-subtitle">{recipe.subtitle}</p>
      <p class="lede">{recipe.intro}</p>
      <ul class="meta-chips" aria-label="Recipe details">
        <li class="meta-chip">{heatText(recipe.heatRange.min, recipe.heatRange.max)}</li>
        <li class="meta-chip">
          {recipe.duration.minimumMinutes}–{recipe.duration.maximumMinutes} min
        </li>
        <li class="meta-chip">About {recipe.duration.preparationMinutes} min of preparation</li>
        {recipe.experimentationRange.max > 0 && (
          <li class="meta-chip">
            Experimentation {recipe.experimentationRange.min}–{recipe.experimentationRange.max}
          </li>
        )}
      </ul>
      {recipe.optIns.length > 0 && (
        <p class="small-note">
          Needs your explicit category opt-in: {recipe.optIns.join(", ")}. The Date Night Machine
          will not use this recipe without it.
        </p>
      )}

      <div class="recipe-columns">
        <section class="plan-supplies" aria-labelledby="ingredients-title">
          <h2 id="ingredients-title">Ingredients</h2>
          {recipe.supplies.length > 0 ? (
            <ul class="chip-grid chip-list">
              {recipe.supplies.map((supply) => (
                <li key={supply.id} class="chip is-static">
                  <span>{supply.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p class="small-note">Nothing to fetch. That is the recipe.</p>
          )}
          <h2>Preparation</h2>
          <ul class="prep-list">
            {recipe.preparation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="method-title">
          <h2 id="method-title">Method</h2>
          <ol class="plan-steps">
            {recipe.steps.map((step) => (
              <li key={step.position} class={`plan-step step-${step.slot}`}>
                <div class="plan-step-head">
                  <span class="plan-step-label">{step.label}</span>
                  <span class="plan-step-time">
                    {step.activity.durationMinutes} min{step.optional ? " · optional" : ""}
                  </span>
                </div>
                <p class="plan-guidance">{step.guidance}</p>
                <h3>{step.activity.title}</h3>
                <p>{step.activity.description}</p>
                <ul class="meta-chips" aria-label="Step details">
                  <li class="meta-chip">{step.activity.categoryTitle}</li>
                  <li class="meta-chip">Heat: {step.activity.heatLabel}</li>
                </ul>
                {step.activity.safetyFlags.length > 0 && (
                  <p class="small-note">House rules: {step.activity.safetyFlags.join(" ")}</p>
                )}
                {step.substitutions.length > 0 && (
                  <p class="small-note">
                    Substitutions: {step.substitutions.map((item) => item.title).join(", ")}.
                  </p>
                )}
              </li>
            ))}
          </ol>
          <p class="plan-closing">{recipe.closing}</p>
        </section>
      </div>

      <div class="result-actions">
        <a class="button" href={`/date-night/?recipe=${encodeURIComponent(recipe.id)}`}>
          Cook this tonight
        </a>
        <button type="button" class="button button-outline" onClick={onBack}>
          Another recipe
        </button>
      </div>
      <p class="result-disclaimer">
        A recipe is a suggestion to talk about, not a script either of you owes the other. Every
        step is optional and passing is a complete answer.
      </p>
    </article>
  );
}
// APP

function Cookbook() {
  const [recipes, setRecipes] = useState<RecipeSummaryDto[] | null>(null);
  const [detail, setDetail] = useState<RecipeDetailDto | null>(null);
  const [mood, setMood] = useState<(typeof MOODS)[number]>("all");
  const [status, setStatus] = useState("Loading the cookbook…");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadRecipes()
      .then((loaded) => {
        if (cancelled) return;
        setRecipes(loaded.recipes);
        setStatus(`${loaded.recipes.length} recipes on the menu.`);
      })
      .catch(() => {
        if (cancelled) return;
        setError("The cookbook could not be opened right now. Try again in a moment.");
        setStatus("The cookbook is unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const open = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    setStatus("Opening the recipe…");
    try {
      const loaded = await loadRecipe(id);
      setDetail(loaded.recipe);
      setStatus(`${loaded.recipe.title} is open.`);
      requestAnimationFrame(() => document.getElementById("recipe-title")?.focus());
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 404
          ? "That recipe is not on the public menu."
          : "That recipe could not be opened. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const back = useCallback(() => {
    setDetail(null);
    setStatus("Back to the full cookbook.");
    requestAnimationFrame(() => document.getElementById("cookbook-title")?.focus());
  }, []);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("recipe");
    if (requested && /^[a-z0-9-]{1,60}$/.test(requested)) void open(requested);
  }, [open]);

  const visible = (recipes ?? []).filter((recipe) => mood === "all" || recipe.mood === mood);

  return (
    <>
      <aside class="topline" aria-label="Audience">
        THE ROMANCE COOKBOOK · FOR CONSENTING ADULTS · 18+
      </aside>
      <header class="site-header wrap">
        <a class="wordmark" href="/">
          cheap<span>seggs</span>
        </a>
        <nav aria-label="Experiences">
          <a href="/play/">The wheels</a>
          <a href="/date-night/">Date Night Machine</a>
          <a href="/privacy/">Privacy</a>
        </nav>
      </header>
      <main class="wrap lounge" id="main">
        <p class="stage-note" role="status" aria-live="polite">
          {busy ? "Working…" : (error ?? status)}
        </p>
        {detail ? (
          <RecipeDetail recipe={detail} onBack={back} />
        ) : (
          <>
            <p class="eyebrow">TONIGHT, FROM THE COOKBOOK</p>
            <h1 id="cookbook-title" tabIndex={-1}>
              Twelve ways to <em>ruin a schedule.</em>
            </h1>
            <p class="lede">
              Food-inspired recipes for an evening, not a menu for dinner. Each one moves from
              atmosphere to warm-up to a main course or two, with substitutions, house rules and a
              real finish. Cook one as written, or let the Date Night Machine adapt it.
            </p>
            <fieldset class="mode-options">
              <legend class="visually-hidden">Filter recipes by mood</legend>
              {MOODS.map((option) => (
                <button
                  key={option}
                  type="button"
                  class={`mode-button ${mood === option ? "is-selected" : ""}`}
                  aria-pressed={mood === option}
                  onClick={() => setMood(option)}
                >
                  {option === "all" ? "Everything" : (MOOD_LABEL[option] ?? option)}
                </button>
              ))}
            </fieldset>
            {recipes === null ? (
              <p class="small-note">Loading the menu…</p>
            ) : (
              <section class="recipe-grid" aria-label="Recipes">
                {visible.map((recipe) => (
                  <RecipeCard key={recipe.id} recipe={recipe} onOpen={() => void open(recipe.id)} />
                ))}
              </section>
            )}
            <section class="house-rules wrap" aria-labelledby="kitchen-rules">
              <div>
                <p class="eyebrow">THE KITCHEN RULES</p>
                <h2 id="kitchen-rules">
                  Recipes, not <em>obligations.</em>
                </h2>
              </div>
              <div>
                <p>
                  Ingredients are suggestions: if you do not have something, skip it or substitute.
                  Nothing in a recipe overrides a boundary, and a step marked optional is genuinely
                  optional.
                </p>
                <p>
                  Recipes that lean on touch, senses, make-believe or power say so. They will not
                  run until that category is switched on.
                </p>
              </div>
            </section>
          </>
        )}
      </main>
      <footer class="wrap site-footer">
        <p>Cook something. Skip anything. Explain nothing.</p>
        <a href="/">Back to CheapSeggs</a>
        <a href="/play/">Spin a wheel</a>
        <a href="/date-night/">Plan the whole evening</a>
      </footer>
    </>
  );
}

const root = document.getElementById("app");
if (root) render(<Cookbook />, root);
