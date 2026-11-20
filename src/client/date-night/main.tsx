import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { PlanDto, PlanFailureDto, PlanStepDto } from "../../domain/recipes";
import {
  ApiError,
  createGuestToken,
  type DateNightConfig,
  loadDateNight,
  requestPlan,
  requestStep,
} from "../api";
import { toggle } from "../wheel/settings";
import "../styles.css";

interface EveningSettings {
  mood: string;
  heat: string;
  experimentation: string;
  energy: string;
  duration: string;
  environment: string;
  supplies: string[];
  optIns: string[];
  excludedCategories: string[];
  excludedActivities: string[];
}

const DEFAULT_SETTINGS: EveningSettings = {
  mood: "romantic",
  heat: "mild",
  experimentation: "classic",
  energy: "moderate",
  duration: "hour",
  environment: "home",
  supplies: [],
  optIns: [],
  excludedCategories: [],
  excludedActivities: [],
};

function configBody(settings: EveningSettings): Record<string, unknown> {
  return {
    mood: settings.mood,
    heat: settings.heat,
    experimentation: settings.experimentation,
    energy: settings.energy,
    duration: settings.duration,
    environment: settings.environment,
    supplies: settings.supplies,
    optIns: settings.optIns,
    excludedCategories: settings.excludedCategories,
    excludedActivities: settings.excludedActivities,
  };
}

function messageFor(code: string): string {
  if (code === "no_candidate")
    return "That slot has no other eligible idea under these boundaries. Nothing was loosened.";
  if (code === "budget" || code === "budget_too_small")
    return "That change would not fit the time you have. Try a longer evening or a shorter step.";
  if (code === "ineligible_choice")
    return "That replacement does not fit your rules, so the recipe left it alone.";
  if (code === "invalid_plan")
    return "That plan was out of date. Build it again and the house will start from your real rules.";
  if (code === "guest_budget_exhausted")
    return "That is a lot of recipes. Clear this session to start fresh.";
  if (code === "rate_limited") return "The kitchen is busy. Give it a minute and try again.";
  if (code === "invalid_request") return "One of those settings was not valid. Check and retry.";
  return "The kitchen could not answer. Check your connection and try again.";
}

function StepCard({
  step,
  busy,
  onReroll,
  onReplace,
  onHide,
}: {
  step: PlanStepDto;
  busy: boolean;
  onReroll: () => void;
  onReplace: (id: string) => void;
  onHide: () => void;
}) {
  const [choice, setChoice] = useState("");
  return (
    <li class={`plan-step step-${step.slot}`}>
      <div class="plan-step-head">
        <span class="plan-step-label">{step.label}</span>
        <span class="plan-step-time">
          {step.minutes} min{step.optional ? " · optional" : ""}
        </span>
      </div>
      <p class="plan-guidance">{step.guidance}</p>
      <h3>{step.activity.title}</h3>
      <p>{step.activity.description}</p>
      <ul class="meta-chips" aria-label="Step details">
        <li class="meta-chip">{step.activity.categoryTitle}</li>
        <li class="meta-chip">Heat: {step.activity.heatLabel}</li>
        <li class="meta-chip">{step.activity.durationMinutes} min</li>
      </ul>
      {step.activity.supplies.length > 0 && (
        <p class="small-note">Needs: {step.activity.supplies.join(", ")}</p>
      )}
      {step.activity.preparation.length > 0 && (
        <section class="result-section">
          <h4>Set-up</h4>
          <ul>
            {step.activity.preparation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {step.activity.accessibility.length > 0 && (
        <section class="result-section">
          <h4>Ways to adapt it</h4>
          <ul>
            {step.activity.accessibility.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {step.activity.safetyFlags.length > 0 && (
        <section class="result-section result-safety">
          <h4>House rules</h4>
          <ul>
            {step.activity.safetyFlags.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      <div class="step-actions">
        <button
          type="button"
          class="button button-outline button-small"
          disabled={busy}
          onClick={onReroll}
        >
          Reroll this step
        </button>
        <button
          type="button"
          class="button button-outline button-small"
          disabled={busy}
          onClick={onHide}
        >
          Not tonight
        </button>
      </div>
      {step.alternates.length > 0 && (
        <div class="replace-row">
          <label>
            <span>Swap for another idea</span>
            <select
              value={choice}
              disabled={busy}
              onChange={(event) => setChoice(event.currentTarget.value)}
            >
              <option value="">Choose an alternative…</option>
              {step.alternates.map((alternate) => (
                <option key={alternate.id} value={alternate.id}>
                  {alternate.title} · {alternate.minutes} min
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            class="button button-small"
            disabled={busy || choice === ""}
            onClick={() => {
              if (choice) onReplace(choice);
            }}
          >
            Use it
          </button>
        </div>
      )}
    </li>
  );
}

function DateNight() {
  const [acknowledged, setAcknowledged] = useState(false);
  const [checked, setChecked] = useState(false);
  const [config, setConfig] = useState<DateNightConfig | null>(null);
  const [settings, setSettings] = useState<EveningSettings>(DEFAULT_SETTINGS);
  const [plan, setPlan] = useState<PlanDto | null>(null);
  const [failure, setFailure] = useState<PlanFailureDto | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferredRecipe, setPreferredRecipe] = useState<string | null>(null);
  const token = useRef(createGuestToken());
  const planHeading = useRef<HTMLHeadingElement | null>(null);
  const menuHeading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("recipe");
    if (requested && /^[a-z0-9-]{1,60}$/.test(requested)) setPreferredRecipe(requested);
    let cancelled = false;
    loadDateNight()
      .then((loaded) => {
        if (!cancelled) setConfig(loaded);
      })
      .catch(() => {
        if (!cancelled) setError("The kitchen is closed right now. Try again in a moment.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!plan) return;
    planHeading.current?.focus();
  }, [plan]);

  const update = useCallback((patch: Partial<EveningSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const build = useCallback(
    async (next: EveningSettings = settings, avoid: string[] = [], recipeOverride?: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      setStatus("Composing an evening from the ideas that fit your rules…");
      try {
        const response = await requestPlan(token.current, {
          config: configBody(next),
          ...((recipeOverride ?? preferredRecipe) !== undefined &&
          (recipeOverride ?? preferredRecipe) !== null
            ? { recipeId: (recipeOverride ?? preferredRecipe) as string }
            : {}),
          avoid,
        });
        if ("status" in response && response.status === "empty") {
          setPlan(null);
          setFailure(response);
          setStatus("No plan was invented. Adjust a limit and try again.");
        } else {
          const built = response as PlanDto;
          setFailure(null);
          setPlan(built);
          setStatus(
            `${built.recipe.title} is ready: ${built.plannedMinutes} minutes in a ${built.budgetMinutes}-minute evening.`,
          );
        }
      } catch (caught) {
        setError(
          caught instanceof ApiError ? messageFor(caught.code) : messageFor("request_failed"),
        );
        setStatus("The plan could not be built.");
      } finally {
        setBusy(false);
      }
    },
    [busy, preferredRecipe, settings],
  );

  const replaceStep = useCallback(
    async (position: number, chosenActivityId?: string) => {
      if (!plan || busy) return;
      setBusy(true);
      setError(null);
      setStatus("Replacing that step…");
      try {
        const response = await requestStep(token.current, {
          config: configBody(settings),
          recipeId: plan.recipe.id,
          recipeVersion: plan.recipe.version,
          steps: plan.steps.map((step) => ({
            position: step.position,
            activityId: step.activity.id,
            version: step.activity.version,
          })),
          targetPosition: position,
          ...(chosenActivityId ? { chosenActivityId } : {}),
          // Current exclusions are already in config. Avoid this answer immediately,
          // including when "Not tonight" has just queued its settings update.
          avoid: plan.steps
            .filter((step) => step.position === position)
            .map((step) => step.activity.id),
        });
        setPlan((current) => {
          if (!current) return current;
          return {
            ...current,
            plannedMinutes: response.plannedMinutes,
            steps: current.steps.map((step) =>
              step.position === response.step.position ? response.step : step,
            ),
          };
        });
        setStatus(`Step replaced: ${response.step.activity.title}.`);
      } catch (caught) {
        setError(
          caught instanceof ApiError ? messageFor(caught.code) : messageFor("request_failed"),
        );
        setStatus("That step was left as it was.");
      } finally {
        setBusy(false);
      }
    },
    [busy, plan, settings],
  );

  const hideStep = useCallback(
    (position: number, activityId: string) => {
      update({ excludedActivities: [...settings.excludedActivities, activityId].slice(-60) });
      void replaceStep(position);
    },
    [replaceStep, settings.excludedActivities, update],
  );

  const retime = useCallback(
    async (duration: string) => {
      if (!plan || busy) return;
      setBusy(true);
      setError(null);
      setStatus("Re-timing the evening around the steps you kept…");
      try {
        const response = await requestPlan(token.current, {
          config: configBody({ ...settings, duration }),
          recipeId: plan.recipe.id,
          keep: plan.steps.map((step) => ({
            position: step.position,
            activityId: step.activity.id,
            version: step.activity.version,
          })),
        });
        if ("status" in response && response.status === "empty") {
          setError(response.message);
          setStatus("The evening was not re-timed. Keep this one or loosen a limit.");
        } else {
          const built = response as PlanDto;
          setSettings((current) => ({ ...current, duration }));
          setPlan(built);
          setStatus(
            `Re-timed to ${built.budgetMinutes} minutes with ${built.plannedMinutes} planned.`,
          );
        }
      } catch (caught) {
        setError(
          caught instanceof ApiError ? messageFor(caught.code) : messageFor("request_failed"),
        );
        setStatus("The evening was not re-timed.");
      } finally {
        setBusy(false);
      }
    },
    [busy, plan, settings],
  );

  const restart = useCallback(() => {
    if (!plan) return;
    void build(
      settings,
      plan.steps.map((step) => step.activity.id),
      plan.recipe.id,
    );
  }, [build, plan, settings]);

  const stop = useCallback(() => {
    setPlan(null);
    setFailure(null);
    setError(null);
    setStatus("Evening closed. Nothing is owed and nothing was saved.");
    menuHeading.current?.focus();
  }, []);

  const backToRules = useCallback(() => {
    setPlan(null);
    setFailure(null);
    setError(null);
    setStatus("Rules are still yours to change.");
    menuHeading.current?.focus();
  }, []);

  return (
    <>
      <aside class="topline" aria-label="Audience">
        THE DATE NIGHT MACHINE · FOR CONSENTING ADULTS · 18+
      </aside>
      <header class="site-header wrap">
        <a class="wordmark" href="/">
          cheap<span>seggs</span>
        </a>
        <nav aria-label="Experiences">
          <a href="/play/">The wheels</a>
          <a href="/recipes/">Cookbook</a>
          <a href="/privacy/">Privacy</a>
        </nav>
      </header>
      <main class="wrap lounge" id="main">
        <p class="eyebrow">TONIGHT&rsquo;S SPECIAL</p>
        <h1>
          A whole evening, <em>composed.</em>
        </h1>
        <p class="lede">
          Set the mood, the limits and what is actually in the house. The machine builds a coherent
          evening from the same reviewed catalog the wheel uses, and every step stays optional.
        </p>
        <p class="stage-note" role="status" aria-live="polite">
          {busy ? "Working on it…" : (error ?? status)}
        </p>

        {!acknowledged ? (
          <section class="entry-card" aria-labelledby="entry-title">
            <span class="menu-icon" aria-hidden="true">
              ♡
            </span>
            <h2 id="entry-title" tabIndex={-1}>
              Adults, on their own terms.
            </h2>
            <p>
              This experience is for consenting adults aged 18 and older. It suggests a shape for an
              evening; it never decides what happens. Everything here is non-explicit.
            </p>
            <label class="check-label">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => setChecked(event.currentTarget.checked)}
              />{" "}
              I am 18 or older and want to plan an evening.
            </label>
            <button
              class="button"
              type="button"
              disabled={!checked}
              onClick={() => setAcknowledged(true)}
            >
              Open the kitchen
            </button>
            <p class="small-note">
              This acknowledgement is not age verification. No settings or plans are stored on the
              server.
            </p>
          </section>
        ) : (
          <>
            {failure && (
              <article class="result-card empty-card" aria-labelledby="empty-title">
                <p class="eyebrow">NOTHING ON THE MENU</p>
                <h2 id="empty-title" tabIndex={-1}>
                  No recipe fits those rules.
                </h2>
                <p class="result-description">{failure.message}</p>
                {failure.hints.length > 0 && (
                  <ul class="hint-list">
                    {failure.hints.map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ul>
                )}
                <div class="result-actions">
                  <button type="button" class="button" onClick={backToRules}>
                    Adjust the rules
                  </button>
                </div>
              </article>
            )}

            {plan && (
              <article class="plan-card" aria-labelledby="plan-title">
                <p class="eyebrow">
                  TONIGHT&rsquo;S RECIPE · {plan.recipe.mood.toUpperCase()} · PREPARED FOR YOU
                </p>
                <h2 id="plan-title" tabIndex={-1} ref={planHeading}>
                  {plan.recipe.title}
                </h2>
                <p class="plan-subtitle">{plan.recipe.subtitle}</p>
                <p class="lede">{plan.recipe.intro}</p>
                <ul class="meta-chips" aria-label="Evening overview">
                  <li class="meta-chip">{plan.budgetMinutes} min budget</li>
                  <li class="meta-chip">{plan.plannedMinutes} min planned</li>
                  <li class="meta-chip">{plan.preparationMinutes} min preparation, counted once</li>
                  <li class="meta-chip">
                    {plan.steps.length} {plan.steps.length === 1 ? "step" : "steps"}
                  </li>
                </ul>

                <section class="plan-supplies" aria-labelledby="supplies-title">
                  <h3 id="supplies-title">Before you start</h3>
                  <ul class="prep-list">
                    {plan.preparation.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  {plan.supplies.length > 0 && (
                    <>
                      <p class="small-note">Put these within reach:</p>
                      <ul class="chip-grid chip-list">
                        {plan.supplies.map((supply) => (
                          <li key={supply.id} class="chip is-static">
                            <span>{supply.title}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {plan.skipped.length > 0 && (
                    <p class="small-note">
                      Optional steps skipped for time: {plan.skipped.join(", ")}. Nothing was
                      substituted to force them in.
                    </p>
                  )}
                </section>

                <ol class="plan-steps">
                  {plan.steps.map((step) => (
                    <StepCard
                      key={step.position}
                      step={step}
                      busy={busy}
                      onReroll={() => void replaceStep(step.position)}
                      onReplace={(id) => void replaceStep(step.position, id)}
                      onHide={() => hideStep(step.position, step.activity.id)}
                    />
                  ))}
                </ol>

                <p class="plan-closing">{plan.recipe.closing}</p>
                <p class="result-disclaimer">{plan.note}</p>

                <div class="plan-controls">
                  <label class="select-field">
                    <span>Change the time budget</span>
                    <select
                      value={settings.duration}
                      disabled={busy}
                      onChange={(event) => void retime(event.currentTarget.value)}
                    >
                      {(config?.options.duration ?? []).map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    class="button button-outline button-small"
                    disabled={busy}
                    onClick={restart}
                  >
                    Restart with fresh ideas
                  </button>
                  <button
                    type="button"
                    class="button button-outline button-small"
                    disabled={busy}
                    onClick={backToRules}
                  >
                    Change the rules
                  </button>
                  <button type="button" class="button button-small" onClick={stop}>
                    Stop for tonight
                  </button>
                </div>
              </article>
            )}

            {!plan && (
              <section class="menu-panel plan-form" aria-labelledby="rules-title">
                <h2 id="rules-title" tabIndex={-1} ref={menuHeading}>
                  Set the rules
                </h2>
                <p class="menu-intro">
                  These limits decide what the machine can serve. Nothing is loosened for you, and a
                  replacement has to pass the same rules as the original step.
                </p>

                <fieldset class="option-group" disabled={busy}>
                  <legend>Mood</legend>
                  <div class="segmented">
                    {(config?.options.mood ?? []).map((option) => (
                      <label
                        key={option.key}
                        class={`segmented-option ${settings.mood === option.key ? "is-active" : ""}`}
                      >
                        <input
                          type="radio"
                          name="mood"
                          value={option.key}
                          checked={settings.mood === option.key}
                          onChange={() => update({ mood: option.key })}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                  <p class="field-note">
                    {config?.options.mood.find((option) => option.key === settings.mood)?.note}
                  </p>
                </fieldset>

                <fieldset class="option-group" disabled={busy}>
                  <legend>Heat ceiling</legend>
                  <div class="segmented">
                    {(config?.options.heat ?? []).map((option) => (
                      <label
                        key={option.key}
                        class={`segmented-option ${settings.heat === option.key ? "is-active" : ""} ${option.available ? "" : "is-locked"}`}
                      >
                        <input
                          type="radio"
                          name="night-heat"
                          value={option.key}
                          checked={settings.heat === option.key}
                          disabled={!option.available}
                          onChange={() => update({ heat: option.key })}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                  <p class="field-note">
                    {config?.options.heat.find((option) => option.key === settings.heat)?.note}
                  </p>
                </fieldset>

                <div class="option-row">
                  <label class="select-field">
                    <span>Experimentation</span>
                    <select
                      value={settings.experimentation}
                      disabled={busy}
                      onChange={(event) => update({ experimentation: event.currentTarget.value })}
                    >
                      {(config?.options.experimentation ?? []).map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label class="select-field">
                    <span>Energy</span>
                    <select
                      value={settings.energy}
                      disabled={busy}
                      onChange={(event) => update({ energy: event.currentTarget.value })}
                    >
                      {(config?.options.energy ?? []).map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div class="option-row">
                  <label class="select-field">
                    <span>Time you have</span>
                    <select
                      value={settings.duration}
                      disabled={busy}
                      onChange={(event) => update({ duration: event.currentTarget.value })}
                    >
                      {(config?.options.duration ?? []).map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label class="select-field">
                    <span>Setting</span>
                    <select
                      value={settings.environment}
                      disabled={busy}
                      onChange={(event) => update({ environment: event.currentTarget.value })}
                    >
                      {(config?.options.environment ?? []).map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>
            )}

            {!plan && (
              <section class="menu-panel" aria-labelledby="extras-title">
                <h2 id="extras-title" class="menu-heading">
                  Ingredients and permissions
                </h2>
                <fieldset class="option-group" disabled={busy}>
                  <legend>What you actually have</legend>
                  <div class="chip-grid">
                    {(config?.supplies ?? []).map((supply) => {
                      const active = settings.supplies.includes(supply.id);
                      return (
                        <label key={supply.id} class={`chip ${active ? "is-active" : ""}`}>
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() =>
                              update({ supplies: toggle(settings.supplies, supply.id) })
                            }
                          />
                          <span>{supply.title}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p class="field-note">
                    Only ideas that need what you have can appear. Anything else is listed as a
                    suggestion before you start, never assumed.
                  </p>
                </fieldset>

                <fieldset class="option-group" disabled={busy}>
                  <legend>Ask before offering</legend>
                  <div class="chip-grid">
                    {(config?.categories ?? [])
                      .filter((category) => category.requiredOptIn)
                      .map((category) => {
                        const active = settings.optIns.includes(category.id);
                        return (
                          <label key={category.id} class={`chip ${active ? "is-active" : ""}`}>
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() =>
                                update({ optIns: toggle(settings.optIns, category.id) })
                              }
                            />
                            <span>{category.title}</span>
                          </label>
                        );
                      })}
                  </div>
                  <p class="field-note">
                    These categories stay off until you turn them on. Recipes that need them will
                    not be offered before then.
                  </p>
                </fieldset>

                <fieldset class="option-group" disabled={busy}>
                  <legend>Hard no</legend>
                  <p class="field-note">Categories you do not want to see tonight.</p>
                  <div class="chip-grid">
                    {(config?.categories ?? []).map((category) => {
                      const blocked = settings.excludedCategories.includes(category.id);
                      return (
                        <label
                          key={category.id}
                          class={`chip chip-no ${blocked ? "is-active" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={blocked}
                            onChange={() =>
                              update({
                                excludedCategories: toggle(
                                  settings.excludedCategories,
                                  category.id,
                                ),
                              })
                            }
                          />
                          <span>{category.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div class="hero-actions">
                  <button
                    type="button"
                    class="button"
                    disabled={busy || !config}
                    onClick={() => void build()}
                  >
                    {busy ? "Composing…" : "Compose my evening"}
                  </button>
                  <button
                    type="button"
                    class="button button-outline"
                    disabled={busy || !config}
                    onClick={() => void build(DEFAULT_SETTINGS)}
                  >
                    Surprise me, gently
                  </button>
                </div>
                <p class="small-note">
                  {config?.disclosure.note ??
                    "A plan is a conversation starter. Every step is optional."}
                </p>
              </section>
            )}
          </>
        )}
      </main>
      <footer class="wrap site-footer">
        <p>Nothing is stored. No plan is consent. Passing is a complete answer.</p>
        <a href="/">Back to CheapSeggs</a>
        <a href="/play/">Spin a wheel</a>
        <a href="/recipes/">Read the cookbook</a>
      </footer>
    </>
  );
}

const root = document.getElementById("app");
if (root) render(<DateNight />, root);
