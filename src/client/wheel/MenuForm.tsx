import type { WheelConfigDto } from "../../domain/wheel";
import type {
  DurationKey,
  EnergyKey,
  EnvironmentKey,
  ExperimentationKey,
  HeatKey,
  Settings,
} from "./settings";
import { toggle } from "./settings";

interface Props {
  config: WheelConfigDto;
  settings: Settings;
  hiddenTitles: Record<string, string>;
  disabled: boolean;
  onChange: (patch: Partial<Settings>) => void;
  onUnhide: (id: string) => void;
  onClearSession: () => void;
}

export function MenuForm({
  config,
  settings,
  hiddenTitles,
  disabled,
  onChange,
  onUnhide,
  onClearSession,
}: Props) {
  const hidden = Object.entries(hiddenTitles);
  return (
    <section class="menu-panel" aria-labelledby="menu-title">
      <h2 id="menu-title" class="menu-heading">
        Set the house rules
      </h2>
      <p class="menu-intro">
        These limits decide what can appear. Nothing is loosened for you, and a spin is always just
        an idea to discuss.
      </p>

      <fieldset class="option-group" disabled={disabled}>
        <legend>Heat ceiling</legend>
        <div class="segmented">
          {config.options.heat.map((option) => {
            const locked = !option.available;
            return (
              <label
                key={option.key}
                class={`segmented-option ${settings.heat === option.key ? "is-active" : ""} ${locked ? "is-locked" : ""}`}
              >
                <input
                  type="radio"
                  name="heat"
                  value={option.key}
                  checked={settings.heat === option.key}
                  disabled={locked}
                  onChange={() => onChange({ heat: option.key as HeatKey })}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
        <p class="field-note">
          {config.options.heat.find((option) => option.key === settings.heat)?.note}
        </p>
      </fieldset>

      <div class="option-row">
        <label class="select-field">
          <span>Experimentation</span>
          <select
            value={settings.experimentation}
            disabled={disabled}
            onChange={(event) =>
              onChange({ experimentation: event.currentTarget.value as ExperimentationKey })
            }
          >
            {config.options.experimentation.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label class="select-field">
          <span>Energy</span>
          <select
            value={settings.energy}
            disabled={disabled}
            onChange={(event) => onChange({ energy: event.currentTarget.value as EnergyKey })}
          >
            {config.options.energy.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div class="option-row">
        <label class="select-field">
          <span>Time you have</span>
          <select
            value={settings.duration}
            disabled={disabled}
            onChange={(event) => onChange({ duration: event.currentTarget.value as DurationKey })}
          >
            {config.options.duration.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label class="select-field">
          <span>Where</span>
          <select
            value={settings.environment}
            disabled={disabled}
            onChange={(event) =>
              onChange({ environment: event.currentTarget.value as EnvironmentKey })
            }
          >
            {config.options.environment.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset class="option-group" disabled={disabled}>
        <legend>Ask before offering</legend>
        <p class="field-note">
          These categories stay off until you switch them on. Switching one on is not agreement to
          anything.
        </p>
        <div class="chip-grid">
          {config.categories
            .filter((category) => category.requiredOptIn)
            .map((category) => {
              const active = settings.optIns.includes(category.id);
              return (
                <label key={category.id} class={`chip ${active ? "is-active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => onChange({ optIns: toggle(settings.optIns, category.id) })}
                  />
                  <span>{category.title}</span>
                </label>
              );
            })}
        </div>
      </fieldset>

      <fieldset class="option-group" disabled={disabled}>
        <legend>Hard no</legend>
        <p class="field-note">Categories you do not want to see tonight.</p>
        <div class="chip-grid">
          {config.categories.map((category) => {
            const blocked = settings.excludedCategories.includes(category.id);
            return (
              <label key={category.id} class={`chip chip-no ${blocked ? "is-active" : ""}`}>
                <input
                  type="checkbox"
                  checked={blocked}
                  onChange={() =>
                    onChange({
                      excludedCategories: toggle(settings.excludedCategories, category.id),
                    })
                  }
                />
                <span>{category.title}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {config.supplies.length > 0 && (
        <fieldset class="option-group" disabled={disabled}>
          <legend>What you have</legend>
          <div class="chip-grid">
            {config.supplies.map((supply) => {
              const active = settings.supplies.includes(supply.id);
              return (
                <label key={supply.id} class={`chip ${active ? "is-active" : ""}`}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => onChange({ supplies: toggle(settings.supplies, supply.id) })}
                  />
                  <span>{supply.title}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <label class="switch-row">
        <input
          type="checkbox"
          checked={settings.avoidRepeats}
          disabled={disabled}
          onChange={(event) => onChange({ avoidRepeats: event.currentTarget.checked })}
        />
        <span>Avoid ideas I have just seen</span>
      </label>

      {hidden.length > 0 && (
        <div class="hidden-list">
          <h3>Hidden tonight</h3>
          <ul>
            {hidden.map(([id, title]) => (
              <li key={id}>
                <span>{title}</span>
                <button
                  type="button"
                  class="text-button"
                  onClick={() => onUnhide(id)}
                  disabled={disabled}
                >
                  Put it back
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" class="button button-outline button-small" onClick={onClearSession}>
        Clear this session
      </button>
      <p class="field-note">
        Clearing forgets tonight&rsquo;s spins on the server and resets every setting here.
      </p>
    </section>
  );
}
