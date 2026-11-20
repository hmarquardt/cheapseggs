import type { SpinResultDto } from "../../domain/wheel";

interface Props {
  result: SpinResultDto;
  partner: SpinResultDto | null;
  dealerCategory: { id: string; title: string } | null;
  combinedMinutes: number | null;
  replayed: boolean;
  eligibleCount: number;
  onSpinAgain: () => void;
  onHide: () => void;
  headingRef: (element: HTMLElement | null) => void;
}

function IdeaBody({ idea }: { idea: SpinResultDto }) {
  return (
    <>
      <p class="result-description">{idea.description}</p>
      <ul class="meta-chips" aria-label="Result details">
        <li class="meta-chip">{idea.categoryTitle}</li>
        <li class="meta-chip">Heat: {idea.heatLabel}</li>
        <li class="meta-chip">{idea.durationMinutes} min</li>
        <li class="meta-chip">
          {idea.energy === 0 ? "Low energy" : idea.energy === 1 ? "Some energy" : "High energy"}
        </li>
      </ul>
      {(idea.supplies.length > 0 || idea.preparation.length > 0) && (
        <section class="result-section">
          <h3>Before you start</h3>
          <ul>
            {[
              ...idea.preparation,
              ...idea.supplies.map((supply) => `You will need: ${supply}`),
            ].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {idea.accessibility.length > 0 && (
        <section class="result-section">
          <h3>Ways to adapt it</h3>
          <ul>
            {idea.accessibility.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {idea.safetyFlags.length > 0 && (
        <section class="result-section result-safety">
          <h3>House rules</h3>
          <ul>
            {idea.safetyFlags.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function ResultCard({
  result,
  partner,
  dealerCategory,
  combinedMinutes,
  replayed,
  eligibleCount,
  onSpinAgain,
  onHide,
  headingRef,
}: Props) {
  return (
    <article class="result-card" aria-labelledby="result-title">
      <p class="eyebrow">{partner ? "DOUBLE TROUBLE · TONIGHT'S PAIR" : "TONIGHT'S SUGGESTION"}</p>
      {dealerCategory && (
        <p class="dealer-note">
          The house chose <strong>{dealerCategory.title}</strong> from the ideas that already fit
          your rules.
        </p>
      )}
      <h2 id="result-title" tabIndex={-1} ref={headingRef}>
        {result.title}
        {partner ? ` + ${partner.title}` : ""}
      </h2>
      <div class={partner ? "pair-grid" : ""}>
        <div class="pair-card">
          {partner && <h3 class="pair-label">First course</h3>}
          <IdeaBody idea={result} />
        </div>
        {partner && (
          <div class="pair-card">
            <h3 class="pair-label">Second course</h3>
            <IdeaBody idea={partner} />
          </div>
        )}
      </div>

      {combinedMinutes !== null && (
        <p class="small-note">
          {combinedMinutes} minutes for both ideas, inside tonight&rsquo;s budget. Each one is
          optional on its own.
        </p>
      )}

      <p class="result-disclaimer">
        This is a prompt for a conversation, not permission, a dare or an obligation. Passing is a
        complete answer.
      </p>

      <div class="result-actions">
        <button type="button" class="button" onClick={onSpinAgain}>
          {partner ? "Deal another pair" : "Spin again"}
        </button>
        <button type="button" class="button button-outline" onClick={onHide}>
          Not tonight
        </button>
      </div>
      <p class="small-note">
        {eligibleCount} {eligibleCount === 1 ? "idea fits" : "ideas fit"} your house rules right
        now.
        {replayed ? " Same result as your last attempt." : ""}
      </p>
    </article>
  );
}
