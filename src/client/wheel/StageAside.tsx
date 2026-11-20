import type { EmptyHint, SpinResponse } from "../../domain/wheel";

type EmptyState = Extract<SpinResponse, { status: "empty" }>;

interface Props {
  empty: EmptyState | null;
  onHint: (hint: EmptyHint) => void;
  onMenu: () => void;
}

function describeChanges(hint: EmptyHint): string {
  return hint.changes
    .map((change) =>
      change.kind === "heat"
        ? `heat to ${change.label}`
        : change.kind === "experimentation"
          ? `experimentation to ${change.label}`
          : change.kind === "energy"
            ? `energy to ${change.label}`
            : `time to ${change.label}`,
    )
    .join(" and ");
}

export function StageAside({ empty, onHint, onMenu }: Props) {
  if (empty) {
    return (
      <article class="result-card empty-card" aria-labelledby="empty-title">
        <p class="eyebrow">NOTHING ON THE MENU</p>
        <h2 id="empty-title" tabIndex={-1}>
          Those limits leave no ideas.
        </h2>
        <p class="result-description">{empty.message}</p>
        {empty.hints.length > 0 && (
          <>
            <p class="small-note">
              You could loosen one limit. Your call, and only if you want to:
            </p>
            <ul class="hint-list">
              {empty.hints.map((hint) => (
                <li key={hint.changes.map((change) => change.kind).join("+")}>
                  <button
                    type="button"
                    class="button button-outline button-small"
                    onClick={() => onHint(hint)}
                  >
                    {describeChanges(hint)} · +{hint.added} ideas
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div class="result-actions">
          <button type="button" class="button" onClick={onMenu}>
            Adjust the menu
          </button>
        </div>
      </article>
    );
  }
  return (
    <aside class="stage-aside" aria-label="How a spin works">
      <h2>Three things a spin is not</h2>
      <ul>
        <li>Not permission. Nobody owes anyone a dare.</li>
        <li>Not a record. No account, no saved history, no cookies.</li>
        <li>Not a dare to finish. Passing is a complete answer.</li>
      </ul>
    </aside>
  );
}
