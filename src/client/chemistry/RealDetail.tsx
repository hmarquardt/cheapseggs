import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { type ChemistryDepth, DIMENSIONS, MANIFESTS } from "../../content/chemistry/questions";
import type { AssessmentSubmission, QuestionResponse } from "../../domain/chemistry";
import { type AcceptMode, modeForResponse, QuestionStep } from "./QuestionStep";
import {
  blankResponse,
  messageForError,
  type OwnView,
  type ReportPayload,
  realApi,
} from "./real-types";

export interface RealDetailProps {
  view: OwnView;
  created: { url: string; label: string } | null;
  message: string;
  busy: boolean;
  onClose: () => void;
  onReload: () => Promise<void>;
  onReport: (payload: ReportPayload) => void;
  onWithdraw: (id: string, method: "POST" | "DELETE") => void;
  onMessage: (message: string) => void;
}

export function RealAssessmentDetail(props: RealDetailProps): JSX.Element {
  const { view } = props;
  const manifest = MANIFESTS[view.depth as ChemistryDepth];
  const [responses, setResponses] = useState<Record<string, QuestionResponse>>(() =>
    Object.fromEntries(
      manifest.questions.map((question) => [
        question.id,
        blankResponse(question.id, question.version, question.intimate),
      ]),
    ),
  );
  const [modes, setModes] = useState<Record<string, AcceptMode>>({});
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(!view.own.submitted);
  const [dimensions, setDimensions] = useState<string[]>(DIMENSIONS.map((entry) => entry.id));
  const [intimacyShared, setIntimacyShared] = useState(false);
  const [hardSignal, setHardSignal] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await realApi<{ submission: AssessmentSubmission }>(
          `/assessments/${view.id}/draft`,
        );
        if (cancelled) return;
        setResponses((current) => {
          const next = { ...current };
          for (const response of body.submission.responses) next[response.questionId] = response;
          return next;
        });
      } catch {
        // No draft yet; the blank private state above is correct.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view.id]);

  const question = manifest.questions[index];
  const current = question
    ? (responses[question.id] ?? blankResponse(question.id, question.version, question.intimate))
    : null;

  const submission = (): AssessmentSubmission => ({
    depth: view.depth,
    manifestId: view.manifestId,
    questionBankVersion: "chemistry-2026-11-19.v1",
    responses: manifest.questions
      .map((entry) => responses[entry.id])
      .filter((entry): entry is QuestionResponse => Boolean(entry)),
    intimacyShared: false,
    hardSignal: false,
  });

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    props.onMessage("");
    try {
      await work();
    } catch (error) {
      props.onMessage(messageForError(error));
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () =>
    act(async () => {
      const body = await realApi<{ revision: number }>(`/assessments/${view.id}/draft`, {
        method: "PUT",
        body: { submission: submission() },
      });
      props.onMessage(`Draft ${body.revision} saved privately.`);
    });

  const submit = () =>
    act(async () => {
      await realApi(`/assessments/${view.id}/submission`, {
        method: "POST",
        body: { submission: submission() },
      });
      setEditing(false);
      await props.onReload();
      props.onMessage("Submission recorded. Any earlier release approvals are now invalid.");
    });

  const approve = () =>
    act(async () => {
      await realApi(`/assessments/${view.id}/approval`, {
        method: "POST",
        body: { dimensions, intimacyShared, hardSignal },
      });
      await props.onReload();
      props.onMessage(
        "Approval recorded for this exact snapshot and scope. The report appears only after both people approve.",
      );
    });

  const openReport = () =>
    act(async () => {
      const payload = await realApi<ReportPayload>(`/assessments/${view.id}/report`);
      props.onReport(payload);
    });

  const decide = () =>
    act(async () => {
      await realApi(`/assessments/${view.id}/decline`, { method: "POST" });
      props.onClose();
    });

  return (
    <section class="chemistry-panel chemistry-real" aria-labelledby="chemistry-real-detail">
      <div class="chemistry-real-heading">
        <h2 id="chemistry-real-detail">Private assessment</h2>
        <button type="button" class="text-link" onClick={props.onClose}>
          Back to assessments
        </button>
      </div>
      <p class="chemistry-note">
        {view.depth} questions · status {view.status.replaceAll("_", " ")} · you are the {view.role}
        . Your answers, acceptance rules and dealbreakers are never shown to the other person.
      </p>
      {props.created ? (
        <div class="chemistry-real-block">
          <h3>Invitation for {props.created.label}</h3>
          <input
            class="chemistry-link"
            readOnly
            value={props.created.url}
            aria-label="Invitation link"
          />
          <button
            type="button"
            class="button button-outline"
            onClick={() =>
              void navigator.clipboard?.writeText(props.created?.url ?? "").catch(() => undefined)
            }
          >
            Copy link
          </button>
          <p class="chemistry-note">
            The link works once, expires in 48 hours and is shown only now. It is not login access.
          </p>
        </div>
      ) : null}
      {view.own.submitted ? (
        <p class="chemistry-note">
          Your snapshot is submitted at revision {view.own.submissionRevision}. Editing it would
          revoke any report and require both people to approve again.
        </p>
      ) : null}
      {props.message ? <p class="chemistry-warning">{props.message}</p> : null}

      {editing && question && current ? (
        <>
          <div class="chemistry-progress">
            <div class="chemistry-progress-track" aria-hidden="true">
              <span style={{ width: `${((index + 1) / manifest.questions.length) * 100}%` }} />
            </div>
            <p class="chemistry-progress-label">
              <span>
                Question {index + 1} of {manifest.questions.length}
              </span>
              <span>Private draft</span>
            </p>
          </div>
          <QuestionStep
            question={question}
            number={index + 1}
            total={manifest.questions.length}
            response={current}
            mode={modes[question.id] ?? modeForResponse(current)}
            onChange={(next) =>
              setResponses((existing) => ({ ...existing, [next.questionId]: next }))
            }
            onModeChange={(mode) => {
              const accept: QuestionResponse["accept"] =
                mode === "unset"
                  ? null
                  : mode === "any"
                    ? "any"
                    : mode === "none"
                      ? []
                      : Array.isArray(current.accept) && current.accept.length > 0
                        ? current.accept
                        : [];
              setModes((existing) => ({ ...existing, [question.id]: mode }));
              setResponses((existing) => ({
                ...existing,
                [question.id]: {
                  ...current,
                  accept,
                  dealbreaker: accept === null ? false : current.dealbreaker,
                },
              }));
            }}
            onBack={() => setIndex(Math.max(0, index - 1))}
            onNext={() => setIndex(Math.min(manifest.questions.length - 1, index + 1))}
            onSkip={(state) => {
              setModes((existing) => ({ ...existing, [question.id]: "unset" }));
              setResponses((existing) => ({
                ...existing,
                [question.id]: {
                  ...current,
                  state,
                  own: [],
                  accept: null,
                  dealbreaker: false,
                },
              }));
              setIndex(Math.min(manifest.questions.length - 1, index + 1));
            }}
            onAnswerRequired={() => props.onMessage("Choose an answer or skip the question.")}
            message=""
          />
          <div class="chemistry-actions">
            <button type="button" class="button" disabled={busy} onClick={submit}>
              Submit for mutual release
            </button>
            <button type="button" class="button button-outline" disabled={busy} onClick={saveDraft}>
              Save private draft
            </button>
            <button type="button" class="text-link" onClick={() => setEditing(false)}>
              Review status
            </button>
          </div>
          <p class="chemistry-note">
            Submitting sends only an encrypted snapshot. It does not share any answer and does not
            approve a report.
          </p>
        </>
      ) : null}

      {!editing ? (
        <div class="chemistry-real-block">
          <h3>Release approval</h3>
          {view.own.submitted ? (
            <>
              <p class="chemistry-note">
                Choose the categories that may contribute to a shared summary. The final report uses
                only categories both people approve. Individual answers, weights and dealbreaker
                ownership are never included.
              </p>
              <div class="chemistry-real-dims">
                {DIMENSIONS.map((dimension) => (
                  <label class="chemistry-check" key={dimension.id}>
                    <input
                      type="checkbox"
                      checked={dimensions.includes(dimension.id)}
                      onChange={(event) =>
                        setDimensions((existing) =>
                          event.currentTarget.checked
                            ? [...new Set([...existing, dimension.id])]
                            : existing.filter((entry) => entry !== dimension.id),
                        )
                      }
                    />
                    <span>{dimension.title}</span>
                  </label>
                ))}
              </div>
              <label class="chemistry-check">
                <input
                  type="checkbox"
                  checked={intimacyShared}
                  onChange={(event) => setIntimacyShared(event.currentTarget.checked)}
                />
                <span>Include intimacy expectations (both people must opt in).</span>
              </label>
              <label class="chemistry-check">
                <input
                  type="checkbox"
                  checked={hardSignal}
                  onChange={(event) => setHardSignal(event.currentTarget.checked)}
                />
                <span>Include the coarse joint hard-requirement signal.</span>
              </label>
              <div class="chemistry-actions">
                <button
                  type="button"
                  class="button"
                  disabled={busy || dimensions.length === 0}
                  onClick={approve}
                >
                  Approve this scope
                </button>
                <button
                  type="button"
                  class="button button-outline"
                  disabled={busy}
                  onClick={openReport}
                >
                  {view.reportAvailable ? "Open the released report" : "Check for the report"}
                </button>
                {view.status !== "released" ? (
                  <button type="button" class="text-link" onClick={() => setEditing(true)}>
                    Edit and resubmit
                  </button>
                ) : null}
              </div>
              <p class="chemistry-note">
                The report needs both approvals for the same snapshot and scope. Until then the
                report endpoint returns a generic unavailable response; it never reveals who has
                approved.
              </p>
            </>
          ) : (
            <p class="chemistry-note">
              Submit your answers before approving a release scope. Nothing is shared yet.
            </p>
          )}
          {view.role === "invitee" && !view.own.submitted ? (
            <button type="button" class="button button-outline" disabled={busy} onClick={decide}>
              Decline participation
            </button>
          ) : null}
        </div>
      ) : null}

      <div class="chemistry-actions">
        <button
          type="button"
          class="button button-outline"
          disabled={busy}
          onClick={() => props.onWithdraw(view.id, "POST")}
        >
          Withdraw assessment
        </button>
        <button
          type="button"
          class="text-link"
          disabled={busy}
          onClick={() => props.onWithdraw(view.id, "DELETE")}
        >
          Delete assessment data
        </button>
      </div>
      <p class="chemistry-note">
        Withdrawal immediately revokes both people's report access and clears the encrypted answers.
        A minimal assessment tombstone remains for the bounded purge window; the pair release ledger
        prevents rapid re-comparison.
      </p>
    </section>
  );
}
