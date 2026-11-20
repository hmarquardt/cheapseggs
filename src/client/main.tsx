import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { EmptyHint, SpinResponse, WheelConfigDto } from "../domain/wheel";
import { ApiError, createGuestToken, loadWheel, requestSpin, resetGuest } from "./api";
import { playLanding, startSpinTicks, stopSpinTicks } from "./sound";
import { MenuForm } from "./wheel/MenuForm";
import { ResultCard } from "./wheel/ResultCard";
import { StageAside } from "./wheel/StageAside";
import { DEFAULT_SETTINGS, type Settings, toSpinBody } from "./wheel/settings";
import { Wheel } from "./wheel/Wheel";
import "./styles.css";

const SPIN_MS = 3400;
/** Mirrors the server bound on `excludedActivities`, so "not tonight" cannot wedge a spin. */
const MAX_EXCLUSIONS = 50;

const EMPTY_CONFIG: WheelConfigDto = {
  wheel: {
    id: "misfortune",
    version: 1,
    title: "The Wheel of Misfortune",
    tagline: "",
    shortlistSize: 8,
    selectionPolicy: "uniform",
  },
  catalogRevision: "unavailable",
  counts: { total: 0, byHeat: {} },
  categories: [],
  supplies: [],
  options: { heat: [], experimentation: [], energy: [], duration: [], environment: [] },
  disclosure: { promptNotConsent: true, note: "" },
};

function messageFor(code: string): string {
  if (code === "guest_budget_exhausted")
    return "That is a lot of spinning. Clear this session to start fresh.";
  if (code === "spin_conflict" || code === "spin_invalidated")
    return "That spin is out of date. Spin again and the wheel will draw fresh.";
  if (code === "rate_limited") return "The lounge is busy. Give it a minute, then spin again.";
  if (code === "unavailable")
    return "The wheel is not available right now. Try again a little later.";
  if (code === "invalid_request") return "Something in those settings was not valid. Try again.";
  return "The wheel could not answer. Check your connection and try again.";
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return reduced;
}

function Lounge() {
  const [acknowledged, setAcknowledged] = useState(false);
  const [checked, setChecked] = useState(false);
  const [config, setConfig] = useState<WheelConfigDto | null>(null);
  const [configError, setConfigError] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [phase, setPhase] = useState<"idle" | "spinning" | "result" | "empty">("idle");
  const [response, setResponse] = useState<SpinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spinCount, setSpinCount] = useState(0);
  const [hiddenTitles, setHiddenTitles] = useState<Record<string, string>>({});
  const token = useRef(createGuestToken());
  const pendingKey = useRef<string | null>(null);
  const entryFocus = useRef(false);
  const resultHeading = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => stopSpinTicks, []);

  useEffect(() => {
    let cancelled = false;
    loadWheel()
      .then((loaded) => {
        if (!cancelled) setConfig(loaded);
      })
      .catch(() => {
        if (!cancelled) setConfigError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!entryFocus.current) {
      entryFocus.current = true;
      return;
    }
    document.getElementById(acknowledged ? "stage-title" : "entry-title")?.focus();
  }, [acknowledged]);

  useEffect(() => {
    if (phase === "result") resultHeading.current?.focus();
  }, [phase]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const runSpin = useCallback(
    async (next: Settings = settings) => {
      if (phase === "spinning" || !config) return;
      setError(null);
      setPhase("spinning");
      startSpinTicks(reduceMotion ? 0 : SPIN_MS, next.sound);
      const idempotencyKey = pendingKey.current ?? crypto.randomUUID();
      pendingKey.current = idempotencyKey;
      try {
        const payload = await requestSpin(token.current, toSpinBody(next, idempotencyKey));
        if (payload.status === "empty") {
          stopSpinTicks();
          pendingKey.current = null;
          setResponse(payload);
          setPhase("empty");
          playLanding(next.sound);
          return;
        }
        pendingKey.current = null;
        setResponse(payload);
        setSpinCount((count) => count + 1);
        await new Promise((resolve) => setTimeout(resolve, reduceMotion ? 0 : SPIN_MS));
        stopSpinTicks();
        setPhase("result");
        playLanding(next.sound);
      } catch (caught) {
        stopSpinTicks();
        setError(
          caught instanceof ApiError ? messageFor(caught.code) : messageFor("request_failed"),
        );
        setPhase("idle");
      }
    },
    [config, phase, reduceMotion, settings],
  );

  const hideResult = useCallback(() => {
    if (response?.status !== "result") return;
    const { id, title } = response.result;
    setHiddenTitles((current) => ({ ...current, [id]: title }));
    // Newest exclusions win; the list stays inside the server's bound.
    update({
      excludedActivities: [...settings.excludedActivities, id].slice(-MAX_EXCLUSIONS),
    });
    setResponse(null);
    setPhase("idle");
    document.getElementById("stage-title")?.focus();
  }, [response, settings.excludedActivities, update]);

  const applyHint = useCallback(
    (hint: EmptyHint) => {
      if (!config) return;
      const patch: Partial<Settings> = {};
      for (const change of hint.changes) {
        if (change.kind === "heat") {
          const option = config.options.heat.find((entry) => entry.label === change.label);
          if (option) patch.heat = option.key as Settings["heat"];
        } else if (change.kind === "experimentation") {
          const option = config.options.experimentation.find(
            (entry) => entry.label === change.label,
          );
          if (option) patch.experimentation = option.key as Settings["experimentation"];
        } else if (change.kind === "energy") {
          const option = config.options.energy.find((entry) => entry.label === change.label);
          if (option) patch.energy = option.key as Settings["energy"];
        } else {
          const option = config.options.duration.find((entry) => entry.label === change.label);
          if (option) patch.duration = option.key as Settings["duration"];
        }
      }
      const next = { ...settings, ...patch };
      setSettings(next);
      void runSpin(next);
    },
    [config, runSpin, settings],
  );

  const clearSession = useCallback(async () => {
    await resetGuest(token.current);
    token.current = createGuestToken();
    pendingKey.current = null;
    setSettings(DEFAULT_SETTINGS);
    setHiddenTitles({});
    setResponse(null);
    setError(null);
    setPhase("idle");
  }, []);

  const result = response?.status === "result" ? response : null;
  const empty = response?.status === "empty" ? response : null;
  const shortlist = result?.shortlist ?? [];
  const selectedIndex = result?.selectedIndex ?? -1;

  return (
    <>
      <aside class="topline" aria-label="Preview status">
        THE LOUNGE · DISCOVERY MODE · 18+
      </aside>
      <header class="site-header wrap">
        <a class="wordmark" href="/">
          cheap<span>seggs</span>
        </a>
        <a
          href="/account/"
          onClick={async (event) => {
            event.preventDefault();
            await clearSession();
            window.location.assign("/account/");
          }}
        >
          Account (clears guest session)
        </a>
        <a href="/privacy/">Privacy & discretion</a>
      </header>
      <main class="wrap lounge" id="main">
        <p class="eyebrow">NO RESERVATION REQUIRED.</p>
        <h1>
          One spin. <em>Zero obligations.</em>
        </h1>

        {!acknowledged ? (
          <section class="entry-card" aria-labelledby="entry-title">
            <span class="menu-icon" aria-hidden="true">
              ♡
            </span>
            <h2 id="entry-title" tabIndex={-1}>
              Adults, on their own terms.
            </h2>
            <p>
              CheapSeggs is for consenting adults aged 18 and older. The wheel suggests things to
              talk about; it never decides what you do. Everything here stays non-explicit.
            </p>
            <label class="check-label">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => setChecked(event.currentTarget.checked)}
              />{" "}
              I am 18 or older and want to spin.
            </label>
            <button
              class="button"
              type="button"
              disabled={!checked}
              onClick={() => setAcknowledged(true)}
            >
              Enter the lounge
            </button>
            <p class="small-note">
              This acknowledgement is not age verification. The wheel does not save your boundary
              settings. Account sign-in is separate.
            </p>
          </section>
        ) : (
          <>
            <section class="mode-strip" aria-labelledby="modes-title">
              <h2 id="modes-title" class="section-heading">
                The house offers three modes.
              </h2>
              <div class="mode-options">
                <button type="button" class="mode-button is-selected" aria-pressed="true">
                  Discovery
                </button>
                <button type="button" class="mode-button" aria-pressed="false" disabled>
                  Mutual Mischief
                </button>
                <button type="button" class="mode-button" aria-pressed="false" disabled>
                  Solo Exploration
                </button>
              </div>
              <p class="small-note">
                Discovery is live and needs no account. Mutual Mischief (independent YES/YES ideas
                only) and Solo are planned and not available yet.
              </p>
            </section>

            <div class="stage">
              <section class="machine" aria-labelledby="stage-title">
                <div class="marquee">
                  <p class="marquee-title">TONIGHT&rsquo;S ENTERTAINMENT</p>
                  <p class="neon-script">The Wheel of</p>
                  <h2 id="stage-title" class="marquee-name" tabIndex={-1}>
                    MISFORTUNE
                  </h2>
                  <Wheel
                    segments={shortlist}
                    selectedIndex={selectedIndex}
                    durationMs={reduceMotion ? 0 : SPIN_MS}
                    spinning={phase === "spinning"}
                    spinCount={spinCount}
                  />
                  <p class="marquee-tagline">
                    Spin responsibly.
                    <br />
                    <em>Misbehave consensually.</em>
                  </p>
                  <button
                    class="button spin-button"
                    type="button"
                    onClick={() => void runSpin()}
                    disabled={phase === "spinning" || !config}
                  >
                    {phase === "spinning" ? "Spinning…" : "Spin the wheel"}
                  </button>
                  <div class="machine-footer">
                    <button
                      type="button"
                      class="text-button"
                      aria-pressed={settings.sound}
                      onClick={() => update({ sound: !settings.sound })}
                    >
                      Sound: {settings.sound ? "on" : "off"}
                    </button>
                    <span class="machine-hint">
                      {config
                        ? `${config.counts.total} reviewed ideas in the catalog`
                        : configError
                          ? "The catalog is unavailable right now."
                          : "Loading the catalog…"}
                    </span>
                  </div>
                </div>
                <p class="stage-note" role="status" aria-live="polite">
                  {phase === "spinning"
                    ? "Spinning for a suggestion…"
                    : (error ??
                      "A spin supplies an idea to discuss. It is never permission to do it.")}
                </p>
              </section>
              <div class="result-column">
                {phase === "result" && result && (
                  <ResultCard
                    result={result.result}
                    replayed={result.replayed}
                    eligibleCount={result.eligibleCount}
                    headingRef={(element) => {
                      resultHeading.current = element;
                    }}
                    onSpinAgain={() => void runSpin()}
                    onHide={hideResult}
                  />
                )}
                {phase !== "result" && (
                  <StageAside
                    empty={empty}
                    onHint={applyHint}
                    onMenu={() => {
                      setResponse(null);
                      setPhase("idle");
                      document.getElementById("menu-title")?.focus();
                    }}
                  />
                )}
              </div>
            </div>

            <section class="wheel-list" aria-labelledby="list-title">
              <h2 id="list-title">On the wheel this round</h2>
              <p class="small-note">
                The wheel is drawn from the ideas that fit your house rules. This list says the same
                thing the animation does, in words.
              </p>
              {shortlist.length > 0 ? (
                <ol class="shortlist">
                  {shortlist.map((segment) => (
                    <li
                      key={segment.id}
                      class={segment.index === selectedIndex ? "is-winner" : ""}
                      aria-current={segment.index === selectedIndex ? "true" : undefined}
                    >
                      {segment.title}
                    </li>
                  ))}
                </ol>
              ) : (
                <p class="small-note">Spin to draw tonight&rsquo;s line-up.</p>
              )}
            </section>

            <MenuForm
              config={config ?? EMPTY_CONFIG}
              settings={settings}
              hiddenTitles={hiddenTitles}
              disabled={phase === "spinning"}
              onChange={update}
              onUnhide={(id) => {
                setHiddenTitles((current) => {
                  const next = { ...current };
                  delete next[id];
                  return next;
                });
                update({
                  excludedActivities: settings.excludedActivities.filter((entry) => entry !== id),
                });
              }}
              onClearSession={() => void clearSession()}
            />
          </>
        )}
      </main>
      <footer class="wrap site-footer">
        <p>Curiosity is optional. Boundaries are mandatory.</p>
        <a href="/">Back to CheapSeggs</a>
      </footer>
    </>
  );
}

const root = document.getElementById("app");
if (root) render(<Lounge />, root);
