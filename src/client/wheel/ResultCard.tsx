import type { SpinResultDto } from "../../domain/wheel";

interface Props {
  result: SpinResultDto;
  replayed: boolean;
  eligibleCount: number;
  onSpinAgain: () => void;
  onHide: () => void;
  headingRef: (element: HTMLElement | null) => void;
}

export function ResultCard({
  result,
  replayed,
  eligibleCount,
  onSpinAgain,
  onHide,
  headingRef,
}: Props) {
  return (
    <article class="result-card" aria-labelledby="result-title">
      <p class="eyebrow">TONIGHT&rsquo;S SUGGESTION</p>
      <h2 id="result-title" tabIndex={-1} ref={headingRef}>
        {result.title}
      </h2>
      <p class="result-description">{result.description}</p>

      <ul class="meta-chips" aria-label="Result details">
        <li class="meta-chip">{result.categoryTitle}</li>
        <li class="meta-chip">Heat: {result.heatLabel}</li>
        <li class="meta-chip">{result.durationMinutes} min</li>
        <li class="meta-chip">
          {result.energy === 0 ? "Low energy" : result.energy === 1 ? "Some energy" : "High energy"}
        </li>
      </ul>

      {(result.supplies.length > 0 || result.preparation.length > 0) && (
        <section class="result-section">
          <h3>Before you start</h3>
          <ul>
            {[
              ...result.preparation,
              ...result.supplies.map((supply) => `You will need: ${supply}`),
            ].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {result.accessibility.length > 0 && (
        <section class="result-section">
          <h3>Ways to adapt it</h3>
          <ul>
            {result.accessibility.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {result.safetyFlags.length > 0 && (
        <section class="result-section result-safety">
          <h3>House rules</h3>
          <ul>
            {result.safetyFlags.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      <p class="result-disclaimer">
        This is a prompt for a conversation, not permission, a dare or an obligation. Passing is a
        complete answer.
      </p>

      <div class="result-actions">
        <button type="button" class="button" onClick={onSpinAgain}>
          Spin again
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
