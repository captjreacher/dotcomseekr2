import { domainsFor, extensionOf, joinLabel, spellingPreview } from '../../lib/discovery/domains';
import { labelForStatus, priceLabel } from '../../lib/discovery/results';
import type { BrandContext, CheckResult } from '../../lib/discovery/types';
import AvailabilityBadge from './AvailabilityBadge';

interface OriginalCheckStepProps {
  brand: BrandContext;
  workingName: string;
  results: Record<string, CheckResult>;
  checking: boolean;
  error: string;
  onCheck: () => void;
  onContinue: () => void;
}

/**
 * Check only the original name against the selected extensions.
 *
 * A name that cannot be verified offers a retry and is never presented as taken.
 */
export default function OriginalCheckStep({
  brand,
  workingName,
  results,
  checking,
  error,
  onCheck,
  onContinue,
}: OriginalCheckStepProps) {
  const domains = domainsFor(workingName, brand.extensions);
  const isBranch = joinLabel(workingName) !== joinLabel(brand.original);
  const unavailable = domains.filter((domain) => results[domain]?.status === 'taken').length;
  const unverified = domains.filter(
    (domain) => results[domain] && results[domain].status === 'unknown'
  ).length;

  return (
    <section className="step-panel" aria-labelledby="original-step-title">
      <p className="eyebrow">Step 2 · the original name</p>
      <h2 id="original-step-title">
        {isBranch ? `Check “${workingName}”` : 'Check your original name'}
      </h2>

      {brand.mode === 'phrase' && (
        <p className="field-hint">
          Your phrase joins to <strong>{spellingPreview(workingName)}</strong> as a domain spelling.
        </p>
      )}

      <div className="domain-chip-row" aria-label="Names to check">
        {domains.map((domain) => (
          <span className="domain-chip" key={domain}>
            <span className="domain-chip-name">{domain}</span>
            {results[domain] ? (
              <AvailabilityBadge status={results[domain].status} />
            ) : (
              <span className="domain-chip-state">{checking ? 'Checking…' : 'Not checked'}</span>
            )}
          </span>
        ))}
      </div>

      <div className="step-actions">
        <button
          className="secondary-action"
          type="button"
          onClick={onCheck}
          disabled={checking || domains.length === 0}
        >
          {checking ? 'Checking the registrar…' : 'Check these names again'}
        </button>
        <button className="primary-action" type="button" onClick={onContinue}>
          Explore names from here
        </button>
      </div>

      {error && (
        <div className="form-error-panel" role="alert">
          <p className="form-error">{error}</p>
          <button className="secondary-action compact" type="button" onClick={onCheck}>
            Retry the check
          </button>
        </div>
      )}

      {domains.length > 0 && !checking && (
        <ul className="result-list" aria-label="Availability of the original name">
          {domains.map((domain) => {
            const result = results[domain];
            if (!result) return null;

            return (
              <li className="result-row" key={domain}>
                <span className="result-domain">{domain}</span>
                <AvailabilityBadge status={result.status} />
                <span className="result-reason">
                  {result.status === 'unknown'
                    ? (result.reason ?? 'No registrar answered for this name.')
                    : result.status === 'taken'
                      ? 'Unavailable. Try a technique below to find a different name.'
                      : result.status === 'premium'
                        ? `Premium price${result.price ? ` ${priceLabel(result.price, result.currency)}` : ''}.`
                        : labelForStatus(result.status)}
                </span>
                <span className="result-actions">
                  {result.registrationUrl && (
                    <a
                      href={result.registrationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="result-link"
                    >
                      Registration options for .{extensionOf(domain)}
                    </a>
                  )}
                  {result.status === 'unknown' && (
                    <button className="link-button" type="button" onClick={onCheck}>
                      Retry
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {(unavailable > 0 || unverified > 0) && (
        <div className="notice-panel" role="status">
          {unavailable > 0 && (
            <p>
              {unavailable === 1 ? 'One name is' : `${unavailable} names are`} already registered.
              That does not end the journey — the techniques below look for a different name that
              keeps your meaning.
            </p>
          )}
          {unverified > 0 && (
            <p>
              {unverified === 1 ? 'One name' : `${unverified} names`} could not be verified. That is
              not the same as taken, so retry before ruling them out.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
