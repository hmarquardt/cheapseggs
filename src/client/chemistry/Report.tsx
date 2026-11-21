import type { JSX } from "preact";
import { DIMENSIONS } from "../../content/chemistry/questions";
import type { Band, BandReason, HardSignal, SharedReport } from "../../domain/chemistry";

const BAND_LABEL: Record<Band, string> = {
  largely_aligned: "Largely aligned",
  some_differences: "Some differences",
  worth_discussing: "Worth discussing",
};

function reasonText(reason: BandReason): string {
  switch (reason) {
    case "not_enough_shared_answers":
      return "Not enough shared answers yet";
    case "intimacy_not_mutually_shared":
      return "Not shared — both people must opt in";
    case "both_directions_not_weighted":
      return "Neither direction weighted these answers";
    case "outside_approved_scope":
      return "Not included in the mutually approved scope";
    case "report_withheld":
      return "Withheld until the report has enough coverage";
    default:
      return "No shared answers yet";
  }
}

function hardSignalText(signal: HardSignal | null): { title: string; body: string } {
  if (signal === "conflict_detected") {
    return {
      title: "A declared hard requirement did not align",
      body: "At least one hard requirement included in this report was not met. The report does not identify whose requirement it was, which category, or how many questions were involved. Talk about it directly.",
    };
  }
  if (signal === "none_detected_in_evaluated_scope") {
    return {
      title: "No included hard requirement conflicted",
      body: "Every hard requirement both people authorized for this report passed on the answers available. Questions either of you skipped remain unknown, not approved.",
    };
  }
  if (signal === "insufficient_information") {
    return {
      title: "Hard requirements could not be fully checked",
      body: "Some authorized hard requirements had no comparable answer. That is not an all-clear; it simply means the available answers could not resolve it.",
    };
  }
  return {
    title: "No joint hard-requirement signal in this report",
    body: "The signal is included only when both people separately approve it. Its absence says nothing about whether dealbreakers exist.",
  };
}

function titleFor(id: SharedReport["strongAlignment"][number]): string {
  return DIMENSIONS.find((dimension) => dimension.id === id)?.title ?? id;
}

export interface ChemistryReportProps {
  report: SharedReport;
  depthName: string;
  onEdit: () => void;
  onRestart: () => void;
  onAnswerMore: () => void;
  onSample: () => void;
}

export function ChemistryReport(props: ChemistryReportProps): JSX.Element {
  const { report } = props;
  const signal = hardSignalText(report.hardConflict);

  if (!report.available) {
    return (
      <section class="chemistry-report" aria-labelledby="chemistry-report-title">
        <p class="chemistry-report-kicker">
          <span>Demonstration pairing</span>
          <span>{props.depthName}</span>
        </p>
        <h1 id="chemistry-report-title">Not enough shared answers for a report.</h1>
        <p class="lede">
          A report needs a few mutually authorized answers in at least three categories. That rule
          keeps a thin set of answers from looking like a verdict — and limits what a coarse summary
          can reveal.
        </p>
        <p>
          Nothing has failed. You can answer more questions, or use demonstration answers to see the
          shape of a finished report.
        </p>
        <div class="chemistry-report-actions">
          <button type="button" class="button" onClick={props.onAnswerMore}>
            Answer more questions
          </button>
          <button type="button" class="button button-outline" onClick={props.onSample}>
            Use demonstration answers
          </button>
          <button type="button" class="text-link" onClick={props.onRestart}>
            Start over
          </button>
        </div>
        <div class="chemistry-report-disclosures">
          {report.disclosures.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section class="chemistry-report" aria-labelledby="chemistry-report-title">
      <p class="chemistry-report-kicker">
        <span>Demonstration pairing</span>
        <span>{props.depthName}</span>
      </p>
      <h1 id="chemistry-report-title">The Chemistry Report.</h1>
      <p class="lede">
        Two sets of private answers, one mutually approved summary. No raw answers, no individual
        weights and no overall match percentage.
      </p>

      <div class="chemistry-band-grid">
        {report.dimensions.map((dimension) => (
          <article
            key={dimension.dimension}
            class={`chemistry-band${dimension.band ? ` band-${dimension.band}` : " band-unassessed"}`}
          >
            <h2>{dimension.title}</h2>
            <p class="chemistry-band-label">
              {dimension.band ? BAND_LABEL[dimension.band] : "Unassessed"}
            </p>
            {dimension.band ? null : <p class="chemistry-note">{reasonText(dimension.detail)}</p>}
          </article>
        ))}
      </div>

      <div class="chemistry-report-section">
        <h2>Where you line up</h2>
        {report.strongAlignment.length ? (
          <ul class="chemistry-list">
            {report.strongAlignment.map((id) => (
              <li key={id}>{titleFor(id)}</li>
            ))}
          </ul>
        ) : (
          <p>
            No category reached the top band. That is not a bad sign; broad coverage usually
            produces more mixed results than identical answers would.
          </p>
        )}
      </div>

      <div class="chemistry-report-section">
        <h2>Different, and both fine with it</h2>
        {report.mutuallyAcceptableDifferences.length ? (
          <ul class="chemistry-list">
            {report.mutuallyAcceptableDifferences.map((id) => (
              <li key={id}>{titleFor(id)}</li>
            ))}
          </ul>
        ) : (
          <p>No category showed a mutually accepted difference in this scope.</p>
        )}
        <p class="chemistry-note">
          Agreement is not the same as compatibility. These categories include answers that differ
          but fall inside both people's declared acceptance rules.
        </p>
      </div>

      <div class="chemistry-report-section">
        <h2>Worth a conversation</h2>
        {report.worthDiscussing.length ? (
          <ul class="chemistry-list">
            {report.worthDiscussing.map((id) => (
              <li key={id}>{titleFor(id)}</li>
            ))}
          </ul>
        ) : (
          <p>Nothing in the assessed scope landed in a discussion band.</p>
        )}
        <p class="chemistry-note">
          A discussion band means the included answers did not fully satisfy both sets of
          expectations. It does not mean either person is wrong.
        </p>
      </div>

      <div class="chemistry-report-section">
        <h2>Unassessed categories</h2>
        {report.unassessed.length ? (
          <ul class="chemistry-list">
            {report.unassessed.map((id) => (
              <li key={id}>{titleFor(id)}</li>
            ))}
          </ul>
        ) : (
          <p>Every category had enough mutually shared answers to assess.</p>
        )}
        <p class="chemistry-note">
          Unassessed is not a low score. Missing information stays unknown rather than being treated
          as agreement, rejection or a zero.
        </p>
      </div>

      <div class="chemistry-report-section chemistry-signal">
        <h2>Hard requirements</h2>
        <p class="chemistry-signal-title">{signal.title}</p>
        <p>{signal.body}</p>
        <p class="chemistry-note">
          Shared only with both people's separate approval. A hard-requirement check never changes
          the alignment bands above.
        </p>
      </div>

      <div class="chemistry-report-section">
        <h2>First-date conversation starters</h2>
        <ul class="chemistry-list chemistry-starters">
          {report.conversationStarters.map((starter) => (
            <li key={starter}>{starter}</li>
          ))}
        </ul>
        <p class="chemistry-note">
          Fixed templates from each category — never generated from anyone's private answers.
        </p>
      </div>

      <div class="chemistry-report-disclosures">
        {report.disclosures.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      <div class="chemistry-report-actions">
        <button type="button" class="button button-outline" onClick={props.onEdit}>
          Review and edit answers
        </button>
        <button type="button" class="text-link" onClick={props.onRestart}>
          Start over
        </button>
      </div>
    </section>
  );
}
