import { joinLabel } from '../../lib/discovery/domains';
import { priceLabel } from '../../lib/discovery/results';
import type { RoundState } from '../../lib/discovery/session';
import {
  TECHNIQUES,
  TECHNIQUE_DESCRIPTIONS,
  TECHNIQUE_LABELS,
  techniqueAvailable,
} from '../../lib/discovery/techniques';
import type { BrandContext, CheckResult, Technique, Variation } from '../../lib/discovery/types';
import AvailabilityBadge from './AvailabilityBadge';

interface ExploreStepProps {
  brand: BrandContext;
  workingName: string;
  round: RoundState | null;
  technique: Technique | null;
  selected: string[];
  generating: boolean;
  checking: boolean;
  error: string;
  shortlistCount: number;
  onSelectTechnique: (technique: Technique) => void;
  onGenerate: () => void;
  onToggleVariation: (spelling: string) => void;
  onToggleAll: () => void;
  onCheckSelected: () => void;
  onSave: (variation: Variation, result: CheckResult) => void;
  onBranch: (spelling: string) => void;
  onRecheck: (domain: string) => void;
  onShowShortlist: () => void;
}

/**
 * One round at a time: choose a technique, propose at most five spellings, then
 * check only the names the user selects with only their selected extensions.
 */
export default function ExploreStep(props: ExploreStepProps) {
  const {
    brand,
    workingName,
    round,
    technique,
    selected,
    generating,
    checking,
    error,
    shortlistCount,
    onSelectTechnique,
    onGenerate,
    onToggleVariation,
    onToggleAll,
    onCheckSelected,
    onSave,
    onBranch,
    onRecheck,
    onShowShortlist,
  } = props;

  const availableTechniques = TECHNIQUES.filter((item) => techniqueAvailable(item, brand.mode));

  return (
    <section className="step-panel" aria-labelledby="explore-step-title">
      <p className="eyebrow">Step 3 · exploration{round ? ` · round ${round.round}` : ''}</p>
      <h2 id="explore-step-title">How should we look at “{workingName}”?</h2>
      <p className="field-hint">
        Each round uses exactly one technique. The AI works inside your meaning and commentary, and
        returns at most five names.
      </p>

      <div className="technique-grid" role="group" aria-label="Exploration techniques">
        {TECHNIQUES.map((item) => {
          const available = techniqueAvailable(item, brand.mode);
          const isActive = technique === item;

          return (
            <button
              key={item}
              type="button"
              className={`technique-card${isActive ? ' active' : ''}`}
              aria-pressed={isActive}
              disabled={!available || generating}
              title={
                available
                  ? TECHNIQUE_DESCRIPTIONS[item]
                  : 'Needs a multi-word name: hyphenate a phrase at its word boundary.'
              }
              onClick={() => onSelectTechnique(item)}
            >
              <span className="technique-name">{TECHNIQUE_LABELS[item]}</span>
              <span className="technique-note">
                {available
                  ? TECHNIQUE_DESCRIPTIONS[item]
                  : 'Needs a multi-word name — a single word has no word boundary to hyphenate.'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="step-actions">
        <button
          className="primary-action"
          type="button"
          onClick={onGenerate}
          disabled={!technique || generating || !availableTechniques.includes(technique)}
        >
          {generating ? 'Asking for ideas…' : round ? 'More ideas' : 'Suggest up to five names'}
        </button>
        <button className="secondary-action" type="button" onClick={onShowShortlist}>
          View saved names ({shortlistCount})
        </button>
      </div>

      {error && (
        <div className="form-error-panel" role="alert">
          <p className="form-error">{error}</p>
        </div>
      )}

      {round && round.variations.length > 0 && (
        <div className="round-panel">
          <div className="round-head">
            <h3>
              Proposed · {TECHNIQUE_LABELS[round.technique]} · {round.variations.length}{' '}
              {round.variations.length === 1 ? 'name' : 'names'}
            </h3>
            <button className="link-button" type="button" onClick={onToggleAll}>
              {selected.length === round.variations.length ? 'Clear selection' : 'Select all'}
            </button>
          </div>

          {round.variations.length < 5 && (
            <p className="field-hint">
              Fewer than five suggestions survived validation — a thin round is better than filler.
            </p>
          )}

          <div className="result-scroll" tabIndex={0} aria-label="Proposed names for this round">
            <ul className="result-list">
              {round.variations.map((variation) => {
                const anyChecked = brand.extensions
                  .map((extension) => round.checked[`${variation.spelling}.${extension}`])
                  .filter((value): value is CheckResult => Boolean(value));
                const purchasable = anyChecked.find(
                  (result) => result.status === 'available' || result.status === 'premium'
                );

                return (
                  <li className="result-row variation-row" key={variation.spelling}>
                    <label className="variation-select">
                      <input
                        type="checkbox"
                        checked={selected.includes(variation.spelling)}
                        onChange={() => onToggleVariation(variation.spelling)}
                      />
                      <span className="result-domain">{variation.spelling}</span>
                    </label>

                    <span className="result-reason">
                      {variation.reason}
                      {variation.changedWord && (
                        <span className="changed-word"> (replaces “{variation.changedWord}”)</span>
                      )}
                    </span>

                    <span className="variation-availability">
                      {anyChecked.length === 0 ? (
                        <span className="domain-chip-state">Not checked</span>
                      ) : (
                        anyChecked.map((result) => (
                          <span className="variation-status" key={result.domain}>
                            <span className="variation-domain">{result.domain}</span>
                            <AvailabilityBadge status={result.status} />
                            {result.price !== null && (
                              <span className="variation-price">
                                {priceLabel(result.price, result.currency)}
                              </span>
                            )}
                            {result.status === 'unknown' && (
                              <span className="variation-price">
                                {result.reason ?? 'No registrar answered for this name.'}
                              </span>
                            )}
                          </span>
                        ))
                      )}
                    </span>

                    <span className="result-actions">
                      {purchasable && (
                        <button
                          className="link-button"
                          type="button"
                          onClick={() => onSave(variation, purchasable)}
                        >
                          Save
                        </button>
                      )}
                      {anyChecked.map((result) =>
                        result.registrationUrl ? (
                          <a
                            key={`register-${result.domain}`}
                            className="result-link"
                            href={result.registrationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Registration options
                          </a>
                        ) : null
                      )}
                      {anyChecked
                        .filter((result) => result.status === 'unknown')
                        .map((result) => (
                          <button
                            key={`retry-${result.domain}`}
                            className="link-button"
                            type="button"
                            onClick={() => onRecheck(result.domain)}
                          >
                            Retry {result.domain}
                          </button>
                        ))}
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => onBranch(variation.spelling)}
                      >
                        Use as working name
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="step-actions">
            <button
              className="primary-action"
              type="button"
              onClick={onCheckSelected}
              disabled={checking || selected.length === 0}
            >
              {checking
                ? 'Checking selected names…'
                : `Check ${selected.length || 'selected'} with .${brand.extensions.join(', .')}`}
            </button>
          </div>

          {round.rejected.length > 0 && (
            <details className="rejected-panel">
              <summary>
                {round.rejected.length} suggestion
                {round.rejected.length === 1 ? '' : 's'} rejected by the boundaries
              </summary>
              <ul>
                {round.rejected.map((item) => (
                  <li key={`${item.value}-${item.reason}`}>
                    <strong>{item.value || '(unnamed)'}</strong>: {item.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {!round && !generating && (
        <div className="notice-panel" role="status">
          <p>
            Nothing is generated or checked until you pick a technique and ask for ideas. The
            original name stays the anchor: {joinLabel(brand.original)}.
          </p>
        </div>
      )}
    </section>
  );
}
