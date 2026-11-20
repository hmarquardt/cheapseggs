import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { EmptyHint, SpinResponse, WheelConfigDto } from "../domain/wheel";
import {
  ApiError,
  createGuestToken,
  loadWheel,
  loadWheels,
  requestSpin,
  resetGuest,
  type WheelSummary,
} from "./api";
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
    description: "",
    shortlistSize: 8,
    selectionPolicy: "uniform",
    drawMode: "single",
  },
  catalogRevision: "unavailable",
  counts: { total: 0, byHeat: {} },
  categories: [],
  supplies: [],
  options: { heat: [], experimentation: [], energy: [], duration: [], environment: [] },
  disclosure: { promptNotConsent: true, note: "" },
};

const MARQUEE: Record<string, { script: string; name: string }> = {
  misfortune: { script: "The Wheel of", name: "MISFORTUNE" },
  foreplay: { script: "The Wheel of", name: "FOREPLAY" },
  "double-trouble": { script: "Double", name: "TROUBLE" },
  "dealers-choice": { script: "Dealer's", name: "CHOICE" },
};

const SPIN_LABEL: Record<string, string> = {
  pair: "Deal a pair",
  category: "Ask the house",
  single: "Spin the wheel",
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
  const [wheels, setWheels] = useState<WheelSummary[]>([]);
  const [wheelId, setWheelId] = useState("misfortune");
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
    loadWheels()
      .then((loaded) => {
        if (!cancelled) setWheels(loaded);
      })
      .catch(() => {
        // The picker is a nicety; the flagship wheel still loads on its own.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setConfigError(false);
    loadWheel(wheelId)
      .then((loaded) => {
        if (!cancelled) setConfig(loaded);
      })
      .catch(() => {
        if (!cancelled) setConfigError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [wheelId]);

  useEffect(() => {
    if (acknowledged && !entryFocus.current) {
      entryFocus.current = true;
      document.getElementById("stage-title")?.focus();
    }
  }, [acknowledged]);

  useEffect(() => {
    if (phase === "result") resultHeading.current?.focus();
  }, [phase]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const chooseWheel = useCallback(
    (nextId: string) => {
      if (nextId === wheelId) return;
      setWheelId(nextId);
      setResponse(null);
      setPhase("idle");
      setError(null);
      pendingKey.current = null;
      document.getElementById("stage-title")?.focus();
    },
    [wheelId],
  );

  const runSpin = useCallback(
    async (next: Settings = settings) => {
      if (phase === "spinning" || !config) return;
      setError(null);
      setPhase("spinning");
      startSpinTicks(reduceMotion ? 0 : SPIN_MS, next.sound);
      const idempotencyKey = pendingKey.current ?? crypto.randomUUID();
      pendingKey.current = idempotencyKey;
      try {
        const payload = await requestSpin(token.current, wheelId, toSpinBody(next, idempotencyKey));
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
    [config, phase, reduceMotion, settings, wheelId],
  );

  const hideResult = useCallback(() => {
    if (response?.status !== "result") return;
    const { id, title } = response.result;
    const partner = response.partner;
    const hide = [id, ...(partner ? [partner.id] : [])];
    setHiddenTitles((current) => {
      const next = { ...current, [id]: title };
      if (partner) next[partner.id] = partner.title;
      return next;
    });
    // Newest exclusions win; the list stays inside the server's bound.
    update({
      excludedActivities: [...settings.excludedActivities, ...hide]
        .filter((entry, index, list) => list.indexOf(entry) === index)
        .slice(-MAX_EXCLUSIONS),
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
  const marquee = MARQUEE[wheelId] ?? { script: "The Wheel of", name: "MISFORTUNE" };
  const drawMode = config?.wheel.drawMode ?? "single";

  return (
    <>
      <aside class="topline" aria-label="Preview status">
        THE LOUNGE · DISCOVERY MODE · 18+
      </aside>
      <header class="site-header wrap">
        <a class="wordmark" href="/">
          cheap<span>seggs</span>
        </a>
        <nav aria-label="Experiences">
          <a href="/date-night/">Date Night Machine</a>
          <a href="/recipes/">Cookbook</a>
          <a href="/privacy/">Privacy</a>
        </nav>
        <a
          href="/account/"
          onClick={async (event) => {
            event.preventDefault();
            await clearSession();
            window.location.assign("/account/");
          }}
        >
          Your account
        </a>
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
                Four wheels. One set of boundaries.
              </h2>
              <fieldset class="mode-options">
                <legend class="visually-hidden">Choose a wheel</legend>
                {(wheels.length > 0
                  ? wheels
                  : [
                      {
                        id: wheelId,
                        title: config?.wheel.title ?? "The Wheel",
                        tagline: "",
                        description: "",
                        drawMode,
                        segmentCount: 0,
                        version: 1,
                      },
                    ]
                ).map((wheel) => (
                  <button
                    key={wheel.id}
                    type="button"
                    class={`mode-button ${wheel.id === wheelId ? "is-selected" : ""}`}
                    aria-pressed={wheel.id === wheelId}
                    onClick={() => chooseWheel(wheel.id)}
                  >
                    {wheel.title}
                  </button>
                ))}
              </fieldset>
              <p class="small-note" aria-live="polite">
                {wheels.find((wheel) => wheel.id === wheelId)?.description ??
                  "Discovery is live and needs no account."}{" "}
                Mutual Mischief (independent YES/YES ideas only) and Solo remain planned.
              </p>
            </section>

            <div class="stage">
              <section class="machine" aria-labelledby="stage-title">
                <div class="marquee">
                  <p class="marquee-title">TONIGHT&rsquo;S ENTERTAINMENT</p>
                  <p class="neon-script">{marquee.script}</p>
                  <h2 id="stage-title" class="marquee-name" tabIndex={-1}>
                    {marquee.name}
                  </h2>
                  <Wheel
                    segments={shortlist}
                    selectedIndex={selectedIndex}
                    durationMs={reduceMotion ? 0 : SPIN_MS}
                    spinning={phase === "spinning"}
                    spinCount={spinCount}
                  />
                  <p class="marquee-tagline">{config?.wheel.tagline ?? ""}</p>
                  <button
                    class="button button-wide"
                    type="button"
                    onClick={() => void runSpin()}
                    disabled={phase === "spinning" || !config}
                  >
                    {phase === "spinning" ? "Drawing…" : (SPIN_LABEL[drawMode] ?? "Spin the wheel")}
                  </button>
                  <div class="stage-meta">
                    <span class="preview-ticket">
                      {config?.counts.total ?? 0} reviewed ideas on this wheel
                    </span>
                    <label class="switch-row switch-inline">
                      <input
                        type="checkbox"
                        checked={settings.sound}
                        onChange={(event) => update({ sound: event.currentTarget.checked })}
                      />
                      <span>Sound</span>
                    </label>
                  </div>
                </div>
                <p class="stage-note" role="status" aria-live="polite">
                  {phase === "spinning"
                    ? "Drawing from the ideas that fit your house rules…"
                    : (error ??
                      config?.disclosure.note ??
                      "A spin supplies an idea to discuss. It is never permission to do it.")}
                </p>
              </section>
              <div class="result-column">
                {phase === "result" && result && (
                  <ResultCard
                    result={result.result}
                    partner={result.partner}
                    dealerCategory={result.dealerCategory}
                    combinedMinutes={result.combinedMinutes}
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
            {configError && (
              <p class="small-note" role="status">
                The catalog could not be loaded. The wheel will not invent an answer; try again in a
                moment.
              </p>
            )}
          </>
        )}
      </main>
      <footer class="wrap site-footer">
        <p>Curiosity is optional. Boundaries are mandatory.</p>
        <a href="/">Back to CheapSeggs</a>
        <a href="/date-night/">Plan a whole evening</a>
        <a href="/recipes/">Read the cookbook</a>
      </footer>
    </>
  );
}

const root = document.getElementById("app");
if (root) render(<Lounge />, root);
