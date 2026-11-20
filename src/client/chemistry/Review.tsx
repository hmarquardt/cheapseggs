import type { JSX } from "preact";
import {
  type ChemistryDepth,
  type ChemistryQuestion,
  DEPTHS,
} from "../../content/chemistry/questions";
import type { QuestionResponse } from "../../domain/chemistry";

export interface ReviewProps {
  questions: readonly ChemistryQuestion[];
  responses: Record<string, QuestionResponse>;
  counts: {
    answered: number;
    skipped: number;
    not_applicable: number;
    unanswered: number;
    dealbreakers: number;
  };
  depth: ChemistryDepth;
  intimacyShared: boolean;
  hardSignal: boolean;
  onIntimacyChange: (value: boolean) => void;
  onHardSignalChange: (value: boolean) => void;
  onEdit: (index: number) => void;
  onShowReport: () => void;
  onFillSample: () => void;
  onBack: () => void;
  error: string;
}

const STATUS_LABEL: Record<QuestionResponse["state"], string> = {
  answered: "Answered",
  skipped: "Skipped",
  not_applicable: "Not applicable",
};

function answerLabel(question: ChemistryQuestion, ids: readonly string[]): string {
  const labels = ids
    .map((id) => question.choices.find((choice) => choice.id === id)?.label)
    .filter((label): label is string => Boolean(label));
  return labels.length ? labels.join(" · ") : "No answer";
}

function acceptanceLabel(question: ChemistryQuestion, accept: QuestionResponse["accept"]): string {
  if (accept === null) return "Acceptance not set";
  if (accept === "any") return "Accepts any answer";
  if (accept.length === 0) return "Accepts no answer";
  return `Accepts: ${answerLabel(question, accept)}`;
}

export function Review(props: ReviewProps): JSX.Element {
  const hasIntimacy = props.questions.some((question) => question.intimate);
  const depthName = DEPTHS.find((entry) => entry.depth === props.depth)?.name ?? "Chemistry Check";
  return (
    <section class="chemistry-review">
      <p class="eyebrow">REVIEW · PRIVATE TO YOU</p>
      <h1 tabIndex={-1}>Review before you share.</h1>
      <p class="lede">
        {depthName}. Nothing has been sent or saved. In the real service, submitting locks this
        snapshot and every edit would require both people to approve a fresh release.
      </p>

      <dl class="chemistry-counts">
        <div>
          <dt>Answered</dt>
          <dd>{props.counts.answered}</dd>
        </div>
        <div>
          <dt>Skipped</dt>
          <dd>{props.counts.skipped}</dd>
        </div>
        <div>
          <dt>Not applicable</dt>
          <dd>{props.counts.not_applicable}</dd>
        </div>
        <div>
          <dt>Not reached</dt>
          <dd>{props.counts.unanswered}</dd>
        </div>
        <div>
          <dt>Dealbreakers</dt>
          <dd>{props.counts.dealbreakers}</dd>
        </div>
      </dl>

      {props.error ? (
        <p class="chemistry-warning" role="alert">
          {props.error}
        </p>
      ) : null}

      <section class="chemistry-panel" aria-labelledby="chemistry-approvals-title">
        <h2 id="chemistry-approvals-title">Sharing decisions</h2>
        {hasIntimacy ? (
          <label class="chemistry-check">
            <input
              type="checkbox"
              checked={props.intimacyShared}
              onChange={(event) => props.onIntimacyChange(event.currentTarget.checked)}
            />
            <span>
              Include the intimacy expectations dimension in an approved category summary.
            </span>
          </label>
        ) : null}
        <p class="chemistry-note">
          Intimacy stays unassessed unless both people separately opt in and at least five shared
          items exist. The demonstration partner does not opt in, so this preview shows that
          dimension as unassessed.
        </p>
        <label class="chemistry-check">
          <input
            type="checkbox"
            checked={props.hardSignal}
            onChange={(event) => props.onHardSignalChange(event.currentTarget.checked)}
          />
          <span>Include the coarse joint hard-requirement signal in the report.</span>
        </label>
        <p class="chemistry-note">
          This signal needs both people's separate approval. It never names whose requirement
          failed, which question it was, or how many were involved. Editing any answer resets this
          approval; the demonstration asks again before it shows a report.
        </p>
      </section>

      <section aria-labelledby="chemistry-answers-title">
        <h2 id="chemistry-answers-title">Your answers</h2>
        <p>
          Every field here is yours. Acceptance rules and dealbreakers are never sent to the other
          person.
        </p>
        {props.counts.unanswered > 0 ? (
          <button type="button" class="button button-outline" onClick={props.onFillSample}>
            Fill the rest with demonstration answers
          </button>
        ) : null}
        <ol class="chemistry-review-list">
          {props.questions.map((question, position) => {
            const response = props.responses[question.id];
            const state = response?.state ?? "skipped";
            const answered = Boolean(response && state === "answered" && response.own.length);
            return (
              <li key={question.id} class={answered ? "" : "is-unanswered"}>
                <div class="chemistry-review-copy">
                  <h3>
                    <span class="chemistry-review-number">{position + 1}.</span> {question.prompt}
                  </h3>
                  <p class="chemistry-review-status">
                    {response ? STATUS_LABEL[state] : "Not reached"}
                    {response?.dealbreaker ? " · Dealbreaker" : ""}
                    {response
                      ? ` · ${response.disclosure === "private" ? "Private only" : "Summary"}`
                      : ""}
                  </p>
                  {answered && response ? (
                    <>
                      <p>
                        <strong>You:</strong> {answerLabel(question, response.own)}
                      </p>
                      <p class="chemistry-note">
                        {acceptanceLabel(question, response.accept)} · importance{" "}
                        {response.importance}
                      </p>
                    </>
                  ) : null}
                  {!answered && response?.state === "not_applicable" ? (
                    <p class="chemistry-note">Excluded from alignment. Not a negative answer.</p>
                  ) : null}
                  {!answered && response?.state === "skipped" ? (
                    <p class="chemistry-note">Unknown. Never treated as agreement or rejection.</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  class="button button-small button-outline"
                  onClick={() => props.onEdit(position)}
                >
                  Edit<span class="visually-hidden"> question {position + 1}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <div class="chemistry-actions">
        <button type="button" class="button" onClick={props.onShowReport}>
          Show the demonstration report
        </button>
        <button type="button" class="button button-outline" onClick={props.onBack}>
          Back to questions
        </button>
      </div>
      <p class="chemistry-note">
        Demonstration pairing: your answers stay in this browser tab and are compared locally with a
        synthetic partner. No request carries them.
      </p>
    </section>
  );
}
