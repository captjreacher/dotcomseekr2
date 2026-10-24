import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, Candidate, Project } from '../services/api';
import SearchProgress from '../components/SearchProgress';
import SiteHeader from '../components/SiteHeader';
import { getAvailabilityLabel, getAvailabilityStatus } from '../lib/availability';
import { isRequestAborted, isRequestTimeout } from '../lib/request';

const strategyOrder = [
  'Exact match',
  'Synonym ideas',
  'Related-word ideas',
  'Rhyme ideas',
  'Phonetic neighbours',
  'Morphological ideas',
  'Alliterative ideas',
];

function JourneyExplorerPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [brandIdea, setBrandIdea] = useState<Project | null>(null);
  const [suggestions, setSuggestions] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [refineQuery, setRefineQuery] = useState('');
  const [saved, setSaved] = useState<string[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const loadAttemptRef = useRef(0);
  const refineAttemptRef = useRef(0);
  const loadControllerRef = useRef<AbortController | null>(null);
  const refineControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void loadRecommendations();
  }, [id]);

  useEffect(() => {
    if (!generating) return;

    const startedAt = Date.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [generating]);

  useEffect(() => {
    return () => {
      loadAttemptRef.current += 1;
      refineAttemptRef.current += 1;
      loadControllerRef.current?.abort();
      refineControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    const stored = localStorage.getItem(`shortlist-${id}`);
    if (stored) setSaved(JSON.parse(stored));
  }, [id]);

  const topSuggestions = useMemo(
    () => [...suggestions].sort((a, b) => b.score_total - a.score_total),
    [suggestions]
  );

  const groupedSuggestions = useMemo(() => groupByStrategy(topSuggestions), [topSuggestions]);

  const savedSuggestions = topSuggestions.filter((candidate) => saved.includes(candidate.id));

  async function loadRecommendations() {
    if (!id) return;

    const attempt = loadAttemptRef.current + 1;
    loadAttemptRef.current = attempt;
    loadControllerRef.current?.abort();

    const controller = new AbortController();
    loadControllerRef.current = controller;

    try {
      setLoading(true);
      setError('');
      const [projectData, candidateData] = await Promise.all([
        api.getProject(id, { signal: controller.signal }),
        api.getCandidates(id, 0, { signal: controller.signal }),
      ]);

      if (attempt !== loadAttemptRef.current) return;

      setBrandIdea(projectData);
      setRefineQuery(projectData.initial_phrase);
      setSuggestions(candidateData);
    } catch (err) {
      if (attempt !== loadAttemptRef.current || isRequestAborted(err)) return;
      setError(describeFailure(err, 'We could not load your suggestions.'));
    } finally {
      if (attempt === loadAttemptRef.current) setLoading(false);
    }
  }

  async function refreshSuggestions() {
    if (!id || !refineQuery.trim()) return;

    const attempt = refineAttemptRef.current + 1;
    refineAttemptRef.current = attempt;
    refineControllerRef.current?.abort();

    const controller = new AbortController();
    refineControllerRef.current = controller;

    try {
      setGenerating(true);
      setError('');
      const freshSuggestions = await api.searchDomains(id, refineQuery.trim(), {
        signal: controller.signal,
      });

      if (attempt !== refineAttemptRef.current) return;
      setSuggestions(freshSuggestions);
    } catch (err) {
      if (attempt !== refineAttemptRef.current || isRequestAborted(err)) return;
      setError(describeFailure(err, 'We could not refresh these suggestions.'));
    } finally {
      if (attempt === refineAttemptRef.current) setGenerating(false);
    }
  }

  function handleRefine(event: FormEvent) {
    event.preventDefault();
    void refreshSuggestions();
  }

  function toggleSaved(candidateId: string) {
    if (!id) return;

    const next = saved.includes(candidateId)
      ? saved.filter((item) => item !== candidateId)
      : [...saved, candidateId];

    setSaved(next);
    localStorage.setItem(`shortlist-${id}`, JSON.stringify(next));
  }

  if (loading) {
    return (
      <main className="page-shell centered-shell">
        <div className="loading-card">
          <p className="eyebrow">Preparing recommendations</p>
          <h1>Finding names worth your attention.</h1>
          <p>We are checking your saved brand idea and availability signals.</p>
        </div>
      </main>
    );
  }

  if (!brandIdea) {
    return (
      <main className="page-shell centered-shell">
        <div className="loading-card">
          <h1>
            {error ? 'We could not load these recommendations.' : 'We could not find this brand idea.'}
          </h1>
          {error && <p className="form-error">{error}</p>}
          <div className="error-actions">
            <button
              className="primary-action"
              type="button"
              onClick={() => void loadRecommendations()}
            >
              Try again
            </button>
            <button className="secondary-action" type="button" onClick={() => navigate('/')}>
              Start a new search
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell recommendations-shell">
      <SiteHeader
        actions={
          <>
            <button className="nav-link" type="button" onClick={() => navigate('/')}>
              New search
            </button>
            <button className="nav-link" type="button" onClick={() => navigate('/create')}>
              New idea
            </button>
          </>
        }
      />

      <section className="recommendation-hero">
        <div>
          <p className="eyebrow">Curated suggestions</p>
          <h1>{brandIdea.name}</h1>
          <p>
            Starting words: <strong>{brandIdea.initial_phrase || 'your keyword'}</strong>
          </p>
        </div>
        <div className="confidence-card">
          <span>{topSuggestions.length}</span>
          <p>domain candidates checked</p>
        </div>
      </section>

      <form className="refine-bar" onSubmit={handleRefine}>
        <input
          value={refineQuery}
          onChange={(event) => setRefineQuery(event.target.value)}
          placeholder="Try another keyword or phrase"
          disabled={generating}
        />
        <button type="submit" disabled={generating || !refineQuery.trim()}>
          Refresh suggestions
        </button>
      </form>

      {generating && (
        <SearchProgress stage="searching" elapsedSeconds={elapsedSeconds} className="wide" />
      )}

      {error && !generating && (
        <div className="form-error-panel" role="alert">
          <p className="form-error">{error}</p>
          <button
            className="secondary-action compact"
            type="button"
            onClick={() => void refreshSuggestions()}
          >
            Try again
          </button>
        </div>
      )}

      {savedSuggestions.length > 0 && (
        <section className="shortlist-panel">
          <div>
            <p className="eyebrow">Shortlist</p>
            <h2>Names you are considering</h2>
          </div>
          <div className="shortlist-row">
            {savedSuggestions.map((candidate) => (
              <span key={candidate.id}>{formatDomain(candidate)}</span>
            ))}
          </div>
        </section>
      )}

      <section className="suggestions-section">
        <div className="section-heading">
          <p className="eyebrow">Naming strategies</p>
          <h2>Domains by strategy</h2>
        </div>

        {topSuggestions.length > 0 ? (
          groupedSuggestions.map((group) => (
            <section className="strategy-group" key={group.label}>
              <div className="strategy-heading">
                <h3>{group.label}</h3>
                <span>{group.items.length}</span>
              </div>
              <div className="suggestion-grid">
                {group.items.map((candidate, index) => {
                  const globalIndex = topSuggestions.findIndex((item) => item.id === candidate.id);

                  return (
                    <DomainSuggestionCard
                      key={candidate.id}
                      candidate={candidate}
                      index={globalIndex < 0 ? index : globalIndex}
                      saved={saved.includes(candidate.id)}
                      onToggleSaved={() => toggleSaved(candidate.id)}
                    />
                  );
                })}
              </div>
            </section>
          ))
        ) : (
          <div className="empty-state">
            <h2>No suggestions yet</h2>
            <p>Refresh the keyword above and we will generate a focused set of options.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function DomainSuggestionCard({
  candidate,
  index,
  saved,
  onToggleSaved,
}: {
  candidate: Candidate;
  index: number;
  saved: boolean;
  onToggleSaved: () => void;
}) {
  const domain = formatDomain(candidate);
  const strategy = getStrategyLabel(candidate);
  const availabilityStatus = getAvailabilityStatus(candidate);
  const availability = getAvailabilityLabel(candidate);
  const tags = getTags(candidate);
  const rationale = getRationale(candidate);
  const registrationUrl = getRegistrationUrl(candidate);

  return (
    <article className={`domain-card ${index === 0 ? 'featured' : ''}`}>
      <div className="card-topline">
        {strategy && <span className="tier-badge">{strategy}</span>}
        <span className={`availability-badge ${availabilityStatus}`}>{availability}</span>
      </div>

      <h3>{domain}</h3>
      <p>{rationale}</p>

      <div className="tag-row">
        {tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>

      <div className="card-actions">
        {registrationUrl ? (
          <a
            href={registrationUrl}
            target="_blank"
            rel="noreferrer"
            className="primary-action compact"
          >
            View registration options
          </a>
        ) : (
          <button className="primary-action compact" type="button">
            Check availability
          </button>
        )}
        <button className="secondary-action compact" type="button" onClick={onToggleSaved}>
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </article>
  );
}

function formatDomain(candidate: Candidate) {
  return `${candidate.domain_name}.${candidate.tld}`;
}

function getTags(candidate: Candidate) {
  const tags = new Set<string>();
  const strategy = getStrategyLabel(candidate);

  if (strategy) tags.add(strategy);
  if (candidate.domain_name.length <= 12) tags.add('Short label');
  if (candidate.tld === 'com') tags.add('.com');
  if (candidate.tld === 'ai') tags.add('.ai');

  return [...tags].slice(0, 4);
}

function getRationale(candidate: Candidate) {
  const metadataRationale = candidate.availability_data?.rationale;
  if (typeof metadataRationale === 'string' && metadataRationale) {
    return metadataRationale;
  }

  if (candidate.tld === 'com') {
    return 'A familiar, trustworthy domain pattern that should feel natural to customers.';
  }

  if (candidate.tld === 'ai') {
    return 'A sharp option for an AI-led product, advisory service, or automation brand.';
  }

  return 'A concise alternative that keeps the idea flexible and easy to say.';
}

function getRegistrationUrl(candidate: Candidate) {
  const value = candidate.availability_data?.registrationUrl;
  return typeof value === 'string' ? value : '';
}

function getStrategyLabel(candidate: Candidate) {
  const value = candidate.availability_data?.strategyLabel;
  return typeof value === 'string' ? value : '';
}

function groupByStrategy(candidates: Candidate[]) {
  const groups = new Map<string, Candidate[]>();

  for (const candidate of candidates) {
    const label = getStrategyLabel(candidate) || 'Other ideas';
    groups.set(label, [...(groups.get(label) ?? []), candidate]);
  }

  return [...groups.entries()]
    .map(([label, items]) => ({ label, items }))
    .sort((a, b) => {
      const aIndex = strategyOrder.includes(a.label) ? strategyOrder.indexOf(a.label) : 999;
      const bIndex = strategyOrder.includes(b.label) ? strategyOrder.indexOf(b.label) : 999;
      return aIndex - bIndex;
    });
}

function describeFailure(error: unknown, fallback: string) {
  if (isRequestTimeout(error)) {
    return 'Live availability checks took too long, so we stopped waiting. Please try again.';
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export default JourneyExplorerPage;
