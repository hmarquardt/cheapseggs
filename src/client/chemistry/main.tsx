import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  CHEMISTRY_BANK_VERSION,
  type ChemistryDepth,
  type ChemistryQuestion,
  DEPTHS,
  DIMENSIONS,
  MANIFESTS,
} from "../../content/chemistry/questions";
import {
  type AssessmentSubmission,
  buildSharedReport,
  type CompatibilityEvaluation,
  evaluateCompatibility,
  type QuestionResponse,
  type SharedReport,
  validateSubmission,
} from "../../domain/chemistry";
import "../styles.css";
import { syntheticResponses, syntheticSubmission } from "./demo";
import { type AcceptMode, modeForResponse, QuestionStep } from "./QuestionStep";
import { ChemistryReport } from "./Report";
import { Review } from "./Review";

type Stage = "landing" | "quiz" | "review" | "report";

const PARTNER_SEED = "chemistry-demo-partner-2026-11";
const SAMPLE_SEED = "chemistry-demo-visitor-2026-11";

function blankResponse(question: ChemistryQuestion): QuestionResponse {
  return {
    questionId: question.id,
    questionVersion: question.version,
    state: "skipped",
    own: [],
    accept: null,
    importance: "medium",
    dealbreaker: false,
    disclosure: question.intimate ? "private" : "summary",
  };
}

function ChemistryApp() {
  const [stage, setStage] = useState<Stage>("landing");
  const [depth, setDepth] = useState<ChemistryDepth>(25);
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, QuestionResponse>>({});
  const [acceptModes, setAcceptModes] = useState<Record<string, AcceptMode>>({});
  const [intimacyShared, setIntimacyShared] = useState(false);
  const [hardSignal, setHardSignal] = useState(false);
  const [message, setMessage] = useState("");
  const [report, setReport] = useState<SharedReport | null>(null);
  const [error, setError] = useState("");
  const mainRef = useRef<HTMLElement>(null);

  const questions = MANIFESTS[depth].questions;
  const question = questions[index];

  useEffect(() => {
    if (stage === "quiz") {
      document.querySelector<HTMLElement>(".chemistry-prompt")?.focus();
    } else {
      mainRef.current?.querySelector<HTMLElement>("h1")?.focus();
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [stage, index]);

  const chooseDepth = (next: ChemistryDepth) => {
    setDepth(next);
    setIndex(0);
    setMessage("");
    setAcceptModes({});
    // Approvals never carry across a depth change; compatible answers may be reused.
    setIntimacyShared(false);
    setHardSignal(false);
  };

  const start = () => {
    setStage("quiz");
    setIndex(0);
    setMessage("");
    setError("");
  };

  const updateResponse = (next: QuestionResponse) => {
    setResponses((current) => ({ ...current, [next.questionId]: next }));
    // Editing answers invalidates a previous joint-signal approval.
    setHardSignal(false);
    setMessage("");
  };

  const changeAcceptMode = (
    target: ChemistryQuestion,
    response: QuestionResponse,
    mode: AcceptMode,
  ) => {
    const accept: QuestionResponse["accept"] =
      mode === "unset"
        ? null
        : mode === "any"
          ? "any"
          : mode === "none"
            ? []
            : Array.isArray(response.accept) && response.accept.length > 0
              ? response.accept
              : [];
    setAcceptModes((current) => ({ ...current, [target.id]: mode }));
    updateResponse({
      ...response,
      accept,
      dealbreaker: accept === null ? false : response.dealbreaker,
    });
  };

  const ownSubmission = useCallback((): AssessmentSubmission => {
    const answered = questions
      .map((entry) => responses[entry.id])
      .filter((entry): entry is QuestionResponse => Boolean(entry));
    return {
      depth,
      manifestId: MANIFESTS[depth].id,
      questionBankVersion: CHEMISTRY_BANK_VERSION,
      responses: answered,
      intimacyShared,
      hardSignal,
    };
  }, [depth, hardSignal, intimacyShared, questions, responses]);

  const evaluate = useCallback((): CompatibilityEvaluation => {
    const own = ownSubmission();
    const invalid = validateSubmission(own);
    if (invalid.length) {
      // Codes only: never echo answers or prompts into an error message.
      setError("Some answers could not be validated. Review them and try again.");
    } else {
      setError("");
    }
    return evaluateCompatibility(
      own,
      syntheticSubmission(depth, PARTNER_SEED, { hardSignal: true }),
    );
  }, [depth, ownSubmission]);

  const showReport = () => {
    setReport(buildSharedReport(evaluate()));
    setStage("report");
  };

  const sampleReport = () => {
    const first = syntheticSubmission(depth, SAMPLE_SEED);
    const second = syntheticSubmission(depth, PARTNER_SEED);
    setReport(buildSharedReport(evaluateCompatibility(first, second)));
    setStage("report");
  };

  const fillSample = (replaceAll: boolean) => {
    const sample = syntheticResponses(depth, SAMPLE_SEED);
    setResponses((current) => {
      if (replaceAll) return Object.fromEntries(sample.map((entry) => [entry.questionId, entry]));
      const merged = { ...current };
      for (const entry of sample) {
        if (!merged[entry.questionId]) merged[entry.questionId] = entry;
      }
      return merged;
    });
    setHardSignal(false);
  };

  const restart = () => {
    setStage("landing");
    setIndex(0);
    setResponses({});
    setAcceptModes({});
    setIntimacyShared(false);
    setHardSignal(false);
    setReport(null);
    setMessage("");
    setError("");
  };

  const counts = questions.reduce(
    (totals, entry) => {
      const response = responses[entry.id];
      if (!response) totals.unanswered += 1;
      else totals[response.state] += 1;
      if (response?.dealbreaker) totals.dealbreakers += 1;
      return totals;
    },
    { answered: 0, skipped: 0, not_applicable: 0, unanswered: 0, dealbreakers: 0 },
  );

  const currentResponse = question ? (responses[question.id] ?? blankResponse(question)) : null;

  return (
    <>
      <a class="skip" href="#main">
        Skip to content
      </a>
      <header class="site-header wrap">
        <a class="wordmark" href="/" aria-label="CheapSeggs home">
          cheap<span>seggs</span>
        </a>
        <nav aria-label="Main">
          <a href="/play/">The wheels</a>
          <a href="/recipes/">Cookbook</a>
          <a href="/account/">Your account</a>
        </nav>
      </header>
      <main id="main" class="wrap chemistry-shell" ref={mainRef}>
        {stage === "landing" ? (
          <Landing
            depth={depth}
            onChooseDepth={chooseDepth}
            onStart={start}
            onSample={sampleReport}
          />
        ) : null}
        {stage === "quiz" && question && currentResponse ? (
          <>
            <div class="chemistry-progress">
              <div class="chemistry-progress-track" aria-hidden="true">
                <span style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
              </div>
              <p class="chemistry-progress-label">
                <span>
                  Question {index + 1} of {questions.length}
                </span>
                <span>{DIMENSIONS.find((entry) => entry.id === question.dimension)?.title}</span>
              </p>
              <p class="chemistry-note">Private to you. Nothing is sent or saved while you work.</p>
            </div>
            <QuestionStep
              question={question}
              number={index + 1}
              total={questions.length}
              response={currentResponse}
              mode={acceptModes[question.id] ?? modeForResponse(currentResponse)}
              onChange={updateResponse}
              onModeChange={(mode) => changeAcceptMode(question, currentResponse, mode)}
              onBack={() => (index === 0 ? setStage("landing") : setIndex(index - 1))}
              onNext={() => {
                setMessage("");
                if (index + 1 >= questions.length) setStage("review");
                else setIndex(index + 1);
              }}
              onSkip={(state) => {
                setAcceptModes((current) => ({ ...current, [question.id]: "unset" }));
                updateResponse({
                  ...(responses[question.id] ?? blankResponse(question)),
                  state,
                  own: [],
                  accept: null,
                  dealbreaker: false,
                });
                if (index + 1 >= questions.length) setStage("review");
                else setIndex(index + 1);
              }}
              onAnswerRequired={() =>
                setMessage(
                  "Choose an answer, skip the question, or mark it not applicable to continue.",
                )
              }
              message={message}
            />
            <p class="chemistry-step-note">
              <button type="button" class="text-link" onClick={() => setStage("review")}>
                Finish early and review
              </button>
              <span aria-hidden="true">·</span>
              <button type="button" class="text-link" onClick={restart}>
                Start over
              </button>
            </p>
          </>
        ) : null}
        {stage === "review" ? (
          <Review
            questions={questions}
            responses={responses}
            counts={counts}
            depth={depth}
            intimacyShared={intimacyShared}
            hardSignal={hardSignal}
            onIntimacyChange={setIntimacyShared}
            onHardSignalChange={setHardSignal}
            onEdit={(target) => {
              setIndex(target);
              setStage("quiz");
            }}
            onShowReport={showReport}
            onFillSample={() => fillSample(false)}
            onBack={() => {
              setIndex(Math.max(0, questions.length - 1));
              setStage("quiz");
            }}
            error={error}
          />
        ) : null}
        {stage === "report" && report ? (
          <ChemistryReport
            report={report}
            depthName={DEPTHS.find((entry) => entry.depth === depth)?.name ?? "Chemistry Check"}
            onEdit={() => setStage("review")}
            onRestart={restart}
            onAnswerMore={() => {
              setStage("quiz");
              setIndex(0);
            }}
            onSample={() => {
              fillSample(true);
              setStage("review");
            }}
          />
        ) : null}
      </main>
      <footer class="wrap site-footer">
        <a class="wordmark" href="/">
          cheap<span>seggs</span>
        </a>
        <p>
          Chemistry Check demonstration. Real two-person assessments require signed-in adults and
          stay closed until their privacy controls pass independent review.
        </p>
        <a href="/privacy/">Privacy &amp; discretion</a>
        <a href="/terms/">Terms</a>
      </footer>
    </>
  );
}

function Landing(props: {
  depth: ChemistryDepth;
  onChooseDepth: (depth: ChemistryDepth) => void;
  onStart: () => void;
  onSample: () => void;
}) {
  const selected = DEPTHS.find((entry) => entry.depth === props.depth) ?? DEPTHS[0];
  return (
    <section class="chemistry-hero">
      <p class="eyebrow">CHEMISTRY CHECK · DEMONSTRATION</p>
      <h1 tabIndex={-1}>
        A little less guessing <em>before the first date.</em>
      </h1>
      <p class="lede">
        Two adults, independent answers, one mutually approved summary. Find out where your
        expectations line up — and where a conversation would help — before you meet.
      </p>
      <p class="pill">PLAYABLE NOW · NO ACCOUNT · NOTHING SAVED</p>

      <section class="chemistry-panel chemistry-depth" aria-labelledby="chemistry-depth-title">
        <h2 id="chemistry-depth-title">Choose how deep to go</h2>
        <p>
          More questions mean more coverage, not proven accuracy. Skipping is fine at every depth,
          and you can finish early.
        </p>
        <div role="radiogroup" aria-labelledby="chemistry-depth-title" class="chemistry-depth-grid">
          {DEPTHS.map((entry) => (
            <label
              key={entry.depth}
              class={`chemistry-depth-card${props.depth === entry.depth ? " is-selected" : ""}`}
            >
              <input
                type="radio"
                name="chemistry-depth"
                value={entry.depth}
                checked={props.depth === entry.depth}
                onChange={() => props.onChooseDepth(entry.depth)}
              />
              <span class="chemistry-depth-count">{entry.depth} questions</span>
              <span class="chemistry-depth-name">{entry.name}</span>
              <span class="chemistry-depth-tagline">{entry.tagline}</span>
              <span class="chemistry-note">{entry.description}</span>
            </label>
          ))}
        </div>
      </section>

      <div class="chemistry-actions">
        <button type="button" class="button" onClick={props.onStart}>
          Start the {selected?.name ?? "Quick Check"}
        </button>
        <button type="button" class="button button-outline" onClick={props.onSample}>
          See a sample report
        </button>
      </div>
      <p class="small-note">
        The sample pairs two synthetic people. It is labelled demonstration data, and it never
        touches a server.
      </p>

      <section class="chemistry-panel" aria-labelledby="chemistry-honest-title">
        <h2 id="chemistry-honest-title">What this preview does not do</h2>
        <ul class="chemistry-list">
          <li>No account is needed, because nothing is saved. Closing the tab discards it.</li>
          <li>
            No real invitations are sent. Two-person assessments stay closed until encrypted
            storage, release approvals and deletion controls pass independent security review.
          </li>
          <li>No answers are used for analytics, advertising or a compatibility leaderboard.</li>
          <li>
            It does not predict attraction, honesty, safety or relationship outcomes, and it is not
            consent to anything.
          </li>
        </ul>
      </section>

      <section class="chemistry-how" aria-labelledby="chemistry-how-title">
        <h2 id="chemistry-how-title">How the real thing is meant to work</h2>
        <ol class="chemistry-steps">
          <li>
            <strong>One person starts.</strong> Choose a depth and create a private assessment. You
            get a time-limited invitation link, not a relationship.
          </li>
          <li>
            <strong>The other person joins independently.</strong> They sign in, see a neutral
            explanation, and accept or decline without seeing your answers.
          </li>
          <li>
            <strong>Both approve a limited summary.</strong> Only category-level bands and a coarse
            hard-requirement signal, only when both people approve the exact scope. Neither person
            ever sees the other's raw answers.
          </li>
        </ol>
      </section>

      <section class="chemistry-panel" aria-labelledby="chemistry-values-title">
        <h2 id="chemistry-values-title">Different is not a failure</h2>
        <p>
          You declare your own answer and the answers you would accept from someone else. Two people
          can answer differently and still be fine for each other. Two people can answer identically
          and still break a declared requirement. The report shows bands, not a verdict.
        </p>
        <p class="chemistry-note">
          Intimacy questions are non-explicit and default to private. A category band for that
          dimension appears only when both people specifically opt in and enough shared items exist.
        </p>
      </section>
    </section>
  );
}

const root = document.getElementById("app");
if (root) render(<ChemistryApp />, root);
