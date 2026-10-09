import { FormEvent, useRef, useState } from 'react';
import { api } from '../services/api';
import {
  AVAILABILITY_ERROR_MESSAGE,
  createLatestGate,
  formatPrice,
  interpretAvailability,
  parseDomainInput,
  quickCheckLabel,
  registrationUrlFor,
  type QuickCheckOutcome,
  type QuickCheckResult,
} from '../lib/quickCheck';

/**
 * Quick Check: check one exact domain the user already has in mind.
 *
 * This intentionally does not generate alternative names. It shows one input,
 * a loading state, and exactly one result — Available, Premium available,
 * Not available, or an error when availability could not be established.
 */
function QuickCheckPanel() {
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [outcome, setOutcome] = useState<QuickCheckOutcome | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkedDomain, setCheckedDomain] = useState<string | null>(null);

  const gateRef = useRef(createLatestGate());
  const controllerRef = useRef<AbortController | null>(null);

  async function runCheck(event: FormEvent) {
    event.preventDefault();

    const parsed = parseDomainInput(input);
    if (!parsed.ok) {
      // Invalid input never reaches the provider.
      setInputError(parsed.message);
      setOutcome(null);
      return;
    }

    setInputError('');
    setOutcome(null);
    setCheckedDomain(parsed.value.domain);
    setChecking(true);

    // Supersede any in-flight check so a stale response cannot overwrite this one.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const token = gateRef.current.begin();

    try {
      const payload = await api.checkDomainAvailability(parsed.value.domain, controller.signal);
      if (!gateRef.current.isCurrent(token)) return;
      setOutcome(interpretAvailability(parsed.value.domain, payload));
    } catch {
      if (!gateRef.current.isCurrent(token) || controller.signal.aborted) return;
      setOutcome({
        kind: 'error',
        error: { domain: parsed.value.domain, message: AVAILABILITY_ERROR_MESSAGE },
      });
    } finally {
      if (gateRef.current.isCurrent(token)) setChecking(false);
    }
  }

  return (
    <section className="quick-check-panel" aria-labelledby="quick-check-heading">
      <div className="section-heading">
        <p className="eyebrow">Quick Check</p>
        <h2 id="quick-check-heading">Check one exact domain</h2>
        <p>Type the specific name you are considering and confirm availability before you commit.</p>
      </div>

      <form className="hero-search" onSubmit={runCheck} noValidate>
        <label htmlFor="quick-check-domain">Domain to check</label>
        <div className="hero-input-row">
          <input
            id="quick-check-domain"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="agent.com"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={inputError ? true : undefined}
            aria-describedby={inputError ? 'quick-check-input-error' : undefined}
          />
          <button type="submit" disabled={checking || !input.trim()}>
            {checking ? 'Checking…' : 'Check'}
          </button>
        </div>
        {inputError ? (
          <p className="form-error" id="quick-check-input-error" role="alert">
            {inputError}
          </p>
        ) : null}
      </form>

      <div className="quick-check-live" aria-live="polite">
        {checking && checkedDomain ? (
          <p className="check-loading">Checking {checkedDomain}…</p>
        ) : null}

        {!checking && outcome?.kind === 'result' ? <CheckResultCard result={outcome.result} /> : null}

        {!checking && outcome?.kind === 'error' ? (
          <div className="check-result error">
            {outcome.error.domain ? <p className="check-domain">{outcome.error.domain}</p> : null}
            <span className="availability-badge error">Error</span>
            <p className="check-message">{outcome.error.message}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CheckResultCard({ result }: { result: QuickCheckResult }) {
  const label = quickCheckLabel(result.status);
  const price = formatPrice(result);
  const registrationUrl = registrationUrlFor({ kind: 'result', result });

  return (
    <div className={`check-result ${result.status}`}>
      <p className="check-domain">{result.domain}</p>
      <span className={`availability-badge ${result.status}`}>{label}</span>
      {price ? <p className="check-price">{price}</p> : null}
      {registrationUrl ? (
        <a className="primary-action compact" href={registrationUrl} target="_blank" rel="noreferrer">
          View registration options
        </a>
      ) : null}
    </div>
  );
}

export default QuickCheckPanel;
