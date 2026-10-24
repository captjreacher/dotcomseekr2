import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReticleFocus from '../components/ReticleFocus';
import SiteHeader from '../components/SiteHeader';
import AvailabilityBadge from '../components/discovery/AvailabilityBadge';
import { BRAND_TAGLINE } from '../brand';
import { exactCheckPayload, toCheckResult } from '../lib/discovery/domains';
import { describeDiscoveryFailure } from '../lib/discovery/errors';
import { createRequestGate } from '../lib/discovery/requests';
import { labelForStatus, priceLabel } from '../lib/discovery/results';
import type { CheckResult } from '../lib/discovery/types';
import { api } from '../services/api';

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking'; domain: string }
  | { kind: 'done'; domain: string; result: CheckResult }
  | { kind: 'error'; domain: string; message: string };

/**
 * Front screen: one exact domain, or the guided assisted search.
 *
 * The exact bar checks the name the user typed and nothing else. No alternative
 * names are generated anywhere on this screen.
 */
export default function FrontScreenPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [state, setState] = useState<CheckState>({ kind: 'idle' });
  const gateRef = useRef(createRequestGate());

  useEffect(() => {
    const gate = gateRef.current;
    return () => gate.cancel();
  }, []);

  async function runCheck(value: string) {
    const payload = exactCheckPayload(value);
    if ('error' in payload) {
      setState({ kind: 'error', domain: value.trim(), message: payload.error });
      return;
    }

    const domain = payload.body.domains[0];
    const request = gateRef.current.begin();
    setState({ kind: 'checking', domain });

    try {
      const response = await api.checkDomains(payload.body.domains, { signal: request.signal });
      if (!request.isCurrent()) return;

      const result = toCheckResult(response.results[0]);
      if (!result) {
        setState({
          kind: 'error',
          domain,
          message: 'The checking service returned no answer for this name. Try again.',
        });
        return;
      }

      setState({ kind: 'done', domain, result });
    } catch (error) {
      if (!request.isCurrent()) return;
      setState({ kind: 'error', domain, message: describeDiscoveryFailure(error) });
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void runCheck(input);
  }

  return (
    <main className="page-shell landing-shell front-shell">
      <SiteHeader
        actions={
          <button
            className="nav-link"
            type="button"
            onClick={() => navigate('/discover?mode=word')}
          >
            Assisted search
          </button>
        }
      />

      <section className="hero-panel">
        <ReticleFocus className="hero-reticle" watermark state="broad" />
        <div className="hero-content">
          <p className="eyebrow">Guided domain discovery</p>
          <p className="hero-tagline">{BRAND_TAGLINE}</p>
          <h1>Find the domain that still means what you meant.</h1>
          <p className="hero-copy">
            Check one exact name, or explore names that keep your original brand meaning instead of
            dumping loosely related words on you.
          </p>
        </div>
      </section>

      <section className="exact-search" aria-labelledby="exact-title">
        <h2 id="exact-title">Check one exact domain</h2>
        <form className="hero-search" onSubmit={handleSubmit}>
          <label htmlFor="exact-domain">Domain</label>
          <div className="hero-input-row">
            <input
              id="exact-domain"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="clean.com"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={state.kind === 'error'}
              aria-describedby="exact-hint"
            />
            <button type="submit" disabled={!input.trim() || state.kind === 'checking'}>
              {state.kind === 'checking' ? 'Checking…' : 'Check domain'}
            </button>
          </div>
          <p className="field-hint" id="exact-hint">
            We check only the name you type, with the extension you include. No alternatives are
            generated, and no extension is added for you.
          </p>
        </form>

        {state.kind === 'error' && (
          <div className="form-error-panel" role="alert">
            <p className="form-error">{state.message}</p>
            <button
              className="secondary-action compact"
              type="button"
              onClick={() => void runCheck(input)}
            >
              Retry
            </button>
          </div>
        )}

        {state.kind === 'done' && (
          <ul className="result-list exact-result" aria-label="Exact domain result">
            <li className="result-row">
              <span className="result-domain">{state.result.domain}</span>
              <AvailabilityBadge status={state.result.status} />
              <span className="result-reason">
                {state.result.status === 'unknown'
                  ? (state.result.reason ?? 'No registrar answered for this name.')
                  : state.result.status === 'premium'
                    ? `Premium price${
                        state.result.price
                          ? ` ${priceLabel(state.result.price, state.result.currency)}`
                          : ''
                      }.`
                    : state.result.status === 'available'
                      ? state.result.price
                        ? `${priceLabel(state.result.price, state.result.currency)} at the registrar.`
                        : 'Available at the registrar.'
                      : 'Already registered.'}
              </span>
              <span className="result-actions">
                {state.result.registrationUrl && (
                  <a
                    className="result-link"
                    href={state.result.registrationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Registration options
                  </a>
                )}
                {labelForStatus(state.result.status) === 'Unable to verify' && (
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => void runCheck(input)}
                  >
                    Retry
                  </button>
                )}
              </span>
            </li>
          </ul>
        )}
      </section>

      <section className="assisted-entry" aria-labelledby="assisted-title">
        <div className="section-heading">
          <p className="eyebrow">Assisted search</p>
          <h2 id="assisted-title">Explore names that keep your meaning</h2>
          <p>
            You choose the meaning and the extensions, then one technique at a time. Each round
            proposes at most five names, and only the ones you pick are checked.
          </p>
        </div>

        <div className="path-grid">
          <article className="path-card">
            <span className="path-badge">One word</span>
            <h3>Start from a single word</h3>
            <p>Best for coined names and short brand words with one clear meaning.</p>
            <button
              className="path-action"
              type="button"
              onClick={() => navigate('/discover?mode=word')}
            >
              Start with one word
            </button>
          </article>

          <article className="path-card">
            <span className="path-badge">Multiple words</span>
            <h3>Start from a phrase</h3>
            <p>
              The phrase joins into one domain spelling, and every suggestion names the word it
              replaces or modifies.
            </p>
            <button
              className="path-action"
              type="button"
              onClick={() => navigate('/discover?mode=phrase')}
            >
              Start with a phrase
            </button>
          </article>
        </div>
      </section>

      <p className="front-note">
        Saved names live in this browser tab for the session. Registration links hand you to a
        registrar; they do not complete a purchase.
      </p>
    </main>
  );
}
