import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import SiteHeader from '../components/SiteHeader';
import BrandStep from '../components/discovery/BrandStep';
import BrandSummaryBar from '../components/discovery/BrandSummaryBar';
import ExploreStep from '../components/discovery/ExploreStep';
import OriginalCheckStep from '../components/discovery/OriginalCheckStep';
import ShortlistPanel from '../components/discovery/ShortlistPanel';
import { domainsFor, toCheckResult } from '../lib/discovery/domains';
import { describeDiscoveryFailure, describeVariationFailure } from '../lib/discovery/errors';
import { checkRequest, variationRequest } from '../lib/discovery/payloads';
import { createRequestGate } from '../lib/discovery/requests';
import { shortlistEntryFrom } from '../lib/discovery/results';
import {
  addToShortlist,
  emptySession,
  loadSession,
  removeFromShortlist,
  saveSession,
  withBrand,
  withCheckedResults,
  withRound,
  withTechnique,
  withWorkingName,
  type DiscoverySession,
  type SessionStorageLike,
} from '../lib/discovery/session';
import { clearTrialKey, readTrialKey, saveTrialKey, trialEndpoint } from '../lib/discovery/trial';
import { sanitizeVariations } from '../lib/discovery/variations';
import type { BrandContext, CheckResult, Variation } from '../lib/discovery/types';
import { isRequestAborted } from '../lib/request';
import { api } from '../services/api';

type Step = 'brand' | 'original' | 'explore';

function tabStorage(): SessionStorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Guided discovery: establish the brand, check the original name, then explore
 * one technique at a time with small, explicitly checked rounds.
 */
export default function DiscoverPage() {
  const [params] = useSearchParams();
  const requestedMode = params.get('mode') === 'phrase' ? 'phrase' : 'word';
  const trialUrl = trialEndpoint();

  const [session, setSession] = useState<DiscoverySession>(() => loadSession(tabStorage()));
  const [step, setStep] = useState<Step>(() =>
    session.brand ? (session.round ? 'explore' : 'original') : 'brand'
  );

  const [originalResults, setOriginalResults] = useState<Record<string, CheckResult>>({});
  const [originalChecking, setOriginalChecking] = useState(false);
  const [originalError, setOriginalError] = useState('');

  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [exploreError, setExploreError] = useState('');
  const [exploreNotice, setExploreNotice] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [shortlistOpen, setShortlistOpen] = useState(false);
  const [trialKey, setTrialKey] = useState(() => readTrialKey());
  const [trialInput, setTrialInput] = useState('');

  const originalGate = useRef(createRequestGate());
  const generateGate = useRef(createRequestGate());
  const checkGate = useRef(createRequestGate());
  const originalAttempted = useRef('');

  const apply = useCallback((updater: (prev: DiscoverySession) => DiscoverySession) => {
    setSession((prev) => saveSession(updater(prev), tabStorage()));
  }, []);

  useEffect(() => {
    const gates = [originalGate.current, generateGate.current, checkGate.current];
    return () => {
      for (const gate of gates) gate.cancel();
    };
  }, []);

  const runOriginalCheck = useCallback(async () => {
    const brand = session.brand;
    if (!brand) return;

    const domains = domainsFor(session.workingName, brand.extensions);
    if (domains.length === 0) return;

    const request = originalGate.current.begin();
    setOriginalChecking(true);
    setOriginalError('');

    try {
      const response = await api.checkDomains(domains, {
        extensions: brand.extensions,
        signal: request.signal,
      });
      if (!request.isCurrent()) return;

      const mapped: Record<string, CheckResult> = {};
      for (const raw of response.results) {
        const result = toCheckResult(raw);
        if (result) mapped[result.domain] = result;
      }
      setOriginalResults(mapped);
    } catch (error) {
      if (!request.isCurrent() || isRequestAborted(error)) return;
      setOriginalError(describeDiscoveryFailure(error));
    } finally {
      if (request.isCurrent()) setOriginalChecking(false);
    }
  }, [session.brand, session.workingName]);

  // Check the original name once per working name, not on every render.
  useEffect(() => {
    if (step !== 'original' || !session.brand) return;

    const key = `${session.workingName}|${session.brand.extensions.join(',')}`;
    if (originalAttempted.current === key) return;

    originalAttempted.current = key;
    void runOriginalCheck();
  }, [step, session.brand, session.workingName, runOriginalCheck]);

  function handleBrand(brand: BrandContext) {
    apply((prev) => withBrand(prev, brand));
    setOriginalResults({});
    setOriginalError('');
    setExploreNotice('');
    originalAttempted.current = '';
    setStep('original');
  }

  async function generate() {
    const brand = session.brand;
    const technique = session.technique;

    if (!brand) {
      setExploreError('Establish the brand first.');
      return;
    }
    if (!technique) {
      setExploreError('Choose one technique first.');
      return;
    }

    if (trialUrl && !trialKey) {
      setExploreError('Enter the trial access code you were given before asking for suggestions.');
      return;
    }

    const request = variationRequest(session, technique);
    if (!request) return;

    const gate = generateGate.current.begin();
    setGenerating(true);
    setExploreError('');
    setExploreNotice('');

    try {
      const response = await api.generateVariations(request, { signal: gate.signal });
      if (!gate.isCurrent()) return;

      const sanitized = sanitizeVariations(response, {
        technique,
        mode: brand.mode,
        workingName: session.workingName,
        original: brand.original,
        meaning: brand.meaning,
        commentary: brand.commentary,
        previous: session.seen,
      });

      if (sanitized.variations.length === 0) {
        setExploreNotice(
          response.noResults?.message ??
            sanitized.rejected[0]?.reason ??
            'The AI returned no usable names for this technique. Try another technique.'
        );
        return;
      }

      setExploreNotice('');
      apply((prev) =>
        withRound(prev, {
          technique,
          workingName: session.workingName,
          variations: sanitized.variations,
          rejected: sanitized.rejected,
          checked: {},
          round: (prev.round?.round ?? 0) + 1,
        })
      );
      setSelected(sanitized.variations.map((variation) => variation.spelling));
    } catch (error) {
      if (!gate.isCurrent() || isRequestAborted(error)) return;
      setExploreError(describeVariationFailure(error));
    } finally {
      if (gate.isCurrent()) setGenerating(false);
    }
  }

  async function checkSelected() {
    if (selected.length === 0) return;

    const payload = checkRequest(session, selected);
    if ('error' in payload) {
      setExploreError(payload.error);
      return;
    }

    const gate = checkGate.current.begin();
    setChecking(true);
    setExploreError('');

    try {
      const response = await api.checkDomains(payload.domains, {
        extensions: payload.extensions,
        signal: gate.signal,
      });
      if (!gate.isCurrent()) return;

      const results = response.results
        .map(toCheckResult)
        .filter((result): result is CheckResult => Boolean(result));

      if (results.length === 0) {
        setExploreError('The checking service returned no answers. Try again.');
        return;
      }

      apply((prev) => withCheckedResults(prev, results));
    } catch (error) {
      if (!gate.isCurrent() || isRequestAborted(error)) return;
      setExploreError(describeDiscoveryFailure(error));
    } finally {
      if (gate.isCurrent()) setChecking(false);
    }
  }

  async function recheckDomain(domain: string) {
    const extension = domain.split('.').slice(1).join('.');
    const gate = checkGate.current.begin();
    setChecking(true);
    setExploreError('');

    try {
      const response = await api.checkDomains([domain], {
        extensions: [extension],
        signal: gate.signal,
      });
      if (!gate.isCurrent()) return;

      const results = response.results
        .map(toCheckResult)
        .filter((result): result is CheckResult => Boolean(result));
      if (results.length === 0) {
        setExploreError('The checking service returned no answer for this name. Try again.');
        return;
      }

      apply((prev) => withCheckedResults(prev, results));
    } catch (error) {
      if (!gate.isCurrent() || isRequestAborted(error)) return;
      setExploreError(describeDiscoveryFailure(error));
    } finally {
      if (gate.isCurrent()) setChecking(false);
    }
  }

  function saveVariation(variation: Variation, result: CheckResult) {
    const technique = session.round?.technique;
    if (!technique) return;

    const entry = shortlistEntryFrom(result, { reason: variation.reason, technique });
    if (!entry) return;

    apply((prev) => addToShortlist(prev, entry));
  }

  function branchTo(spelling: string) {
    apply((prev) => withWorkingName(prev, spelling));
    setOriginalResults({});
    setOriginalError('');
    setExploreNotice('');
    originalAttempted.current = '';
    setSelected([]);
    setExploreError('');
    setStep('original');
  }

  function startOver() {
    setSession(saveSession(emptySession(), tabStorage()));
    originalAttempted.current = '';
    setOriginalResults({});
    setOriginalError('');
    setExploreNotice('');
    setSelected([]);
    setExploreError('');
    setStep('brand');
    setShortlistOpen(false);
  }

  function saveTrialAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = saveTrialKey(trialInput);
    setTrialKey(saved);
    setTrialInput('');
    if (saved) setExploreError('');
  }

  function forgetTrialAccess() {
    clearTrialKey();
    setTrialKey('');
    setTrialInput('');
  }

  function toggleVariation(spelling: string) {
    setSelected((current) =>
      current.includes(spelling)
        ? current.filter((item) => item !== spelling)
        : [...current, spelling]
    );
  }

  function toggleAll() {
    setSelected((current) => {
      if (!session.round) return [];

      return current.length === session.round.variations.length
        ? []
        : session.round.variations.map((variation) => variation.spelling);
    });
  }

  const mode = session.brand?.mode ?? requestedMode;

  return (
    <main className="page-shell discovery-shell">
      <SiteHeader
        actions={
          <>
            <button className="nav-link" type="button" onClick={() => setShortlistOpen(true)}>
              Saved names ({session.shortlist.length})
            </button>
            <button className="nav-link" type="button" onClick={startOver}>
              Start over
            </button>
          </>
        }
      />

      <ol className="step-rail" aria-label="Discovery progress">
        <li aria-current={step === 'brand' ? 'step' : undefined}>
          <span>1</span> Brand
        </li>
        <li aria-current={step === 'original' ? 'step' : undefined}>
          <span>2</span> Original name
        </li>
        <li aria-current={step === 'explore' ? 'step' : undefined}>
          <span>3</span> Explore
        </li>
      </ol>

      {session.brand && step !== 'brand' && (
        <BrandSummaryBar
          brand={session.brand}
          workingName={session.workingName}
          onEdit={() => setStep('brand')}
        />
      )}

      {trialUrl && step === 'explore' && (
        <section className="trial-access" aria-labelledby="trial-access-title">
          <div className="trial-access-copy">
            <p className="eyebrow">Cloudflare Workers AI trial</p>
            <h2 id="trial-access-title">Tester access</h2>
            <p className="field-hint">
              This build asks the isolated Cloudflare trial for suggestions. Enter the access code
              you were given; it stays in this tab and is checked on the server.
            </p>
          </div>
          <form className="trial-access-form" onSubmit={saveTrialAccess}>
            <div>
              <label htmlFor="trial-access-code">Trial access code</label>
              <input
                id="trial-access-code"
                type="password"
                value={trialInput}
                onChange={(event) => setTrialInput(event.target.value)}
                placeholder="dcs_trial_..."
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button
              className="secondary-action compact"
              type="submit"
              disabled={!trialInput.trim()}
            >
              {trialKey ? 'Replace code' : 'Use trial'}
            </button>
            {trialKey && (
              <button className="link-button" type="button" onClick={forgetTrialAccess}>
                Stop using trial
              </button>
            )}
          </form>
          <p className="trial-access-status" role="status">
            {trialKey
              ? 'Trial access is active for this tab. Usage is recorded against a pseudonymous session.'
              : 'No trial access code is saved yet.'}
          </p>
        </section>
      )}

      {step === 'brand' && (
        <BrandStep mode={mode} initial={session.brand} onContinue={handleBrand} />
      )}

      {step === 'original' && session.brand && (
        <OriginalCheckStep
          brand={session.brand}
          workingName={session.workingName}
          results={originalResults}
          checking={originalChecking}
          error={originalError}
          onCheck={() => void runOriginalCheck()}
          onContinue={() => setStep('explore')}
        />
      )}

      {step === 'explore' && session.brand && (
        <ExploreStep
          brand={session.brand}
          workingName={session.workingName}
          round={session.round}
          technique={session.technique}
          selected={selected}
          generating={generating}
          checking={checking}
          error={exploreError}
          notice={exploreNotice}
          shortlistCount={session.shortlist.length}
          onSelectTechnique={(technique) => {
            apply((prev) => withTechnique(prev, technique));
            setExploreError('');
            setExploreNotice('');
          }}
          onGenerate={() => void generate()}
          onToggleVariation={toggleVariation}
          onToggleAll={toggleAll}
          onCheckSelected={() => void checkSelected()}
          onSave={saveVariation}
          onBranch={branchTo}
          onRecheck={(domain) => void recheckDomain(domain)}
          onShowShortlist={() => setShortlistOpen(true)}
        />
      )}

      {shortlistOpen && (
        <ShortlistPanel
          entries={session.shortlist}
          onRemove={(domain) => apply((prev) => removeFromShortlist(prev, domain))}
          onClose={() => setShortlistOpen(false)}
        />
      )}
    </main>
  );
}
