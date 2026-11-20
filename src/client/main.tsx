import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import "./styles.css";

const modes = [
  {
    id: "discovery",
    title: "Discovery",
    description: "An idea to talk about. A spin never authorizes an activity.",
  },
  {
    id: "mutual",
    title: "Mutual Mischief",
    description:
      "Planned: only current, independently approved YES/YES ideas. Two accounts and sharing approval required.",
  },
  {
    id: "solo",
    title: "Solo Exploration",
    description:
      "Planned: a private space for your own curiosity. Nothing is shared automatically.",
  },
] as const;

function Lounge() {
  const [acknowledged, setAcknowledged] = useState(false);
  const [checked, setChecked] = useState(false);
  const [mode, setMode] = useState<string>("discovery");
  const selected = modes.find((entry) => entry.id === mode) ?? modes[0];
  const hasRendered = useRef(false);
  useEffect(() => {
    if (hasRendered.current) {
      document.getElementById(acknowledged ? "modes-title" : "entry-title")?.focus();
    }
    hasRendered.current = true;
  }, [acknowledged]);

  return (
    <>
      <aside class="topline" aria-label="Preview status">
        THE LOUNGE · LOCAL FOUNDATION PREVIEW
      </aside>
      <header class="site-header wrap">
        <a class="wordmark" href="/">
          cheap<span>seggs</span>
        </a>
        <a href="/privacy/">Privacy & discretion</a>
      </header>
      <main class="wrap lounge" id="main">
        <p class="eyebrow">NO RESERVATION REQUIRED.</p>
        <h1>
          A little <em>curiosity?</em>
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
              CheapSeggs is for consenting adults aged 18 and older. This preview contains only
              non-explicit sample ideas and mode explanations.
            </p>
            <label class="check-label">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => setChecked(event.currentTarget.checked)}
              />{" "}
              I am 18 or older and want to view the preview.
            </label>
            <button
              class="button"
              type="button"
              disabled={!checked}
              onClick={() => setAcknowledged(true)}
            >
              Enter the lounge preview
            </button>
            <p class="small-note">
              This acknowledgement is not age verification. Nothing is saved.
            </p>
          </section>
        ) : (
          <section aria-labelledby="modes-title">
            <h2 id="modes-title" class="section-heading" tabIndex={-1}>
              The house offers three modes.
            </h2>
            <div class="mode-options">
              {modes.map((entry) => (
                <button
                  key={entry.id}
                  class={`mode-button ${mode === entry.id ? "is-selected" : ""}`}
                  type="button"
                  aria-pressed={mode === entry.id}
                  onClick={() => setMode(entry.id)}
                >
                  {entry.title}
                </button>
              ))}
            </div>
            <div class="mode-description" aria-live="polite">
              <h3>{selected.title}</h3>
              <p>{selected.description}</p>
            </div>
            <div class="preview-content">
              <div class="preview-sign">
                <p class="eyebrow">THE WHEEL OF</p>
                <h2>Misfortune</h2>
                <div class="small-wheel" aria-hidden="true">
                  ♥
                </div>
                <p>Our next milestone: the first playable wheel.</p>
                <span class="pill">NOT PLAYABLE YET</span>
              </div>
              <div>
                <p class="eyebrow">A TASTE OF THE FREE CATALOG</p>
                <h2>
                  Good chemistry,
                  <br />
                  <em>on the house.</em>
                </h2>
                <article class="sample">
                  <h3>Set the soundtrack</h3>
                  <p>Pick one song each and make a tiny soundtrack for the evening.</p>
                </article>
                <article class="sample">
                  <h3>Compliments, on the house</h3>
                  <p>
                    Take turns sharing something you appreciate about each other. Passing is always
                    welcome.
                  </p>
                </article>
                <article class="sample">
                  <h3>The living-room slow dance</h3>
                  <p>
                    Invite a dance. Seated movement or simply listening together works beautifully.
                  </p>
                </article>
              </div>
            </div>
            <div class="foundation-note">
              <h3>Coming with the full experience</h3>
              <p>
                Accounts, private preferences, partner invitations, recipes, saved ideas, and
                content packs are planned. There is no live sign-in or checkout in this foundation.
              </p>
            </div>
            <button
              class="button button-outline"
              type="button"
              onClick={() => {
                setAcknowledged(false);
                setChecked(false);
                setMode("discovery");
              }}
            >
              Clear this preview
            </button>
          </section>
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
