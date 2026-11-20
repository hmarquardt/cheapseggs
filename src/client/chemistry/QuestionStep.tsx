import type { JSX } from "preact";
import { useId } from "preact/hooks";
import type { ChemistryQuestion } from "../../content/chemistry/questions";
import {
  type AnswerState,
  IMPORTANCE_OPTIONS,
  type QuestionResponse,
} from "../../domain/chemistry";

export type AcceptMode = "unset" | "any" | "specific" | "none";

export interface QuestionStepProps {
  question: ChemistryQuestion;
  number: number;
  total: number;
  response: QuestionResponse;
  mode: AcceptMode;
  onChange: (next: QuestionResponse) => void;
  onModeChange: (mode: AcceptMode) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: (state: Exclude<AnswerState, "answered">) => void;
  onAnswerRequired: () => void;
  message: string;
}

function modeFromAccept(accept: QuestionResponse["accept"]): AcceptMode {
  if (accept === null) return "unset";
  if (accept === "any") return "any";
  return accept.length === 0 ? "none" : "specific";
}

export function modeForResponse(response: QuestionResponse): AcceptMode {
  return modeFromAccept(response.accept);
}

export function QuestionStep(props: QuestionStepProps): JSX.Element {
  const { question, response, mode } = props;
  const group = useId();
  const acceptedIds = Array.isArray(response.accept) ? response.accept : [];
  const answered = response.state === "answered" && response.own.length > 0;

  const setMode = (next: AcceptMode) => props.onModeChange(next);

  const toggleOwn = (id: string) => {
    const own =
      question.kind === "single"
        ? [id]
        : response.own.includes(id)
          ? response.own.filter((entry) => entry !== id)
          : [...response.own, id];
    props.onChange({ ...response, state: own.length > 0 ? "answered" : "skipped", own });
  };

  const toggleAccepted = (id: string) => {
    const next = acceptedIds.includes(id)
      ? acceptedIds.filter((entry) => entry !== id)
      : [...acceptedIds, id];
    props.onChange({
      ...response,
      accept: next,
      dealbreaker: next.length === 0 ? false : response.dealbreaker,
    });
  };

  return (
    <section class="chemistry-card" aria-labelledby={`${group}-prompt`}>
      <p class="chemistry-meta">
        <span class="chemistry-dimension">{question.dimension.replaceAll("-", " ")}</span>
        <span>
          Question {props.number} of {props.total}
        </span>
      </p>
      <h2 id={`${group}-prompt`} class="chemistry-prompt" tabIndex={-1}>
        {question.prompt}
      </h2>
      {question.help ? <p class="chemistry-help">{question.help}</p> : null}

      <fieldset class="chemistry-fieldset">
        <legend>Your answer</legend>
        <div class={question.layout === "scale" ? "chemistry-scale" : "chemistry-options"}>
          {question.choices.map((choice) => {
            const checked = response.own.includes(choice.id);
            const inputType = question.kind === "multi" ? "checkbox" : "radio";
            return (
              <label key={choice.id} class={`chemistry-option${checked ? " is-selected" : ""}`}>
                <input
                  type={inputType}
                  name={`${group}-own`}
                  value={choice.id}
                  checked={checked}
                  onChange={() => toggleOwn(choice.id)}
                />
                <span>{choice.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset class="chemistry-fieldset">
        <legend>Answers you would accept from them</legend>
        <p class="chemistry-help" id={`${group}-accept-help`}>
          This is your rule, and it stays private. Different answers can be perfectly acceptable;
          identical answers can still break a declared rule.
        </p>
        <div
          class="chemistry-modes"
          role="radiogroup"
          aria-label="Acceptance rule"
          aria-describedby={`${group}-accept-help`}
        >
          {(
            [
              ["unset", "Not set yet"],
              ["any", "Any of these answers"],
              ["specific", "Only the ones I tick"],
              ["none", "None of these"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} class={`chemistry-mode${mode === value ? " is-selected" : ""}`}>
              <input
                type="radio"
                name={`${group}-accept-mode`}
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {mode === "specific" ? (
          <div class="chemistry-options chemistry-accept-list">
            {question.choices.map((choice) => (
              <label
                key={choice.id}
                class={`chemistry-option${acceptedIds.includes(choice.id) ? " is-selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={acceptedIds.includes(choice.id)}
                  onChange={() => toggleAccepted(choice.id)}
                />
                <span>{choice.label}</span>
              </label>
            ))}
          </div>
        ) : null}
        {mode === "specific" && acceptedIds.length === 0 ? (
          <p class="chemistry-warning" role="alert">
            No answers ticked yet. Ticking none means you would accept none of these answers; it is
            not a skip. Tick at least one, or choose “None of these” to say it outright.
          </p>
        ) : null}
        {mode === "none" ? (
          <p class="chemistry-warning" role="alert">
            None of these answers is acceptable to you. That is allowed, but this question cannot
            contribute a positive alignment and will show as a discussion point rather than quietly
            disappearing.
          </p>
        ) : null}
        {mode === "unset" ? (
          <p class="chemistry-note">
            Unknown is not agreement. Until you choose a rule, this question cannot contribute to a
            shared band.
          </p>
        ) : null}
      </fieldset>

      <fieldset class="chemistry-fieldset">
        <legend>How much does this affect alignment?</legend>
        <div class="chemistry-modes chemistry-importance">
          {IMPORTANCE_OPTIONS.map((option) => (
            <label
              key={option.value}
              class={`chemistry-mode${response.importance === option.value ? " is-selected" : ""}`}
            >
              <input
                type="radio"
                name={`${group}-importance`}
                value={option.value}
                checked={response.importance === option.value}
                onChange={() => props.onChange({ ...response, importance: option.value })}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <label class="chemistry-check">
          <input
            type="checkbox"
            checked={response.dealbreaker}
            disabled={response.accept === null}
            onChange={(event) =>
              props.onChange({ ...response, dealbreaker: event.currentTarget.checked })
            }
          />
          <span>This is a dealbreaker — a hard requirement, not just a strong preference.</span>
        </label>
        {response.accept === null ? (
          <p class="chemistry-note">Choose an acceptance rule before marking a hard requirement.</p>
        ) : null}
        {response.dealbreaker ? (
          <p class="chemistry-note">
            Hard requirements are checked separately from alignment. The shared report may show only
            a coarse joint signal, never who declared it or which question failed.
          </p>
        ) : null}
      </fieldset>

      <fieldset class="chemistry-fieldset">
        <legend>Sharing this answer</legend>
        <div class="chemistry-modes">
          <label class={`chemistry-mode${response.disclosure === "summary" ? " is-selected" : ""}`}>
            <input
              type="radio"
              name={`${group}-disclosure`}
              value="summary"
              checked={response.disclosure === "summary"}
              onChange={() => props.onChange({ ...response, disclosure: "summary" })}
            />
            <span>May contribute to an approved category summary</span>
          </label>
          <label class={`chemistry-mode${response.disclosure === "private" ? " is-selected" : ""}`}>
            <input
              type="radio"
              name={`${group}-disclosure`}
              value="private"
              checked={response.disclosure === "private"}
              onChange={() => props.onChange({ ...response, disclosure: "private" })}
            />
            <span>Private only</span>
          </label>
        </div>
        <p class="chemistry-note">
          Private-only answers never affect the report — not its bands, availability, warnings or
          suggested topics. They still count when you review your own answers.
        </p>
      </fieldset>

      {props.message ? (
        <p class="chemistry-warning" role="alert">
          {props.message}
        </p>
      ) : null}

      <div class="chemistry-step-actions">
        <button
          type="button"
          class="button button-outline"
          onClick={props.onBack}
          disabled={props.number === 1}
        >
          Back
        </button>
        <div class="chemistry-step-secondary">
          <button type="button" class="text-link" onClick={() => props.onSkip("skipped")}>
            Skip this question
          </button>
          <button type="button" class="text-link" onClick={() => props.onSkip("not_applicable")}>
            Not applicable to me
          </button>
        </div>
        <button
          type="button"
          class="button"
          onClick={() => (answered ? props.onNext() : props.onAnswerRequired())}
        >
          {props.number === props.total ? "Review my answers" : "Next question"}
        </button>
      </div>
    </section>
  );
}
