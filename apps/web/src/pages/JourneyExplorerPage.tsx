import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, Candidate, Project } from '../services/api';

type MatchTier = 'Premium Pick' | 'Recommended' | 'Strong Match';

const loadingSteps = [
  'Analyzing brand direction...',
  'Finding strong domain patterns...',
  'Checking availability...',
  'Curating recommendations...',
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
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    loadRecommendations();
  }, [id]);

  useEffect(() => {
    if (!generating) return;

    const timer = window.setInterval(() => {
      setStepIndex((current) => Math.min(current + 1, loadingSteps.length - 1));
    }, 850);

    return () => window.clearInterval(timer);
  }, [generating]);

  useEffect(() => {
    if (!id) return;
    const stored = localStorage.getItem(`shortlist-${id}`);
    if (stored) setSaved(JSON.parse(stored));
  }, [id]);

  const topSuggestions = useMemo(
    () => [...suggestions].sort((a, b) => b.score_total - a.score_total),
    [suggestions]
  );

  const savedSuggestions = topSuggestions.filter((candidate) => saved.includes(candidate.id));

  async function loadRecommendations() {
    if (!id) return;

    try {
      setLoading(true);
      setError('');
      const [projectData, candidateData] = await Promise.all([
        api.getProject(id),
        api.getCandidates(id),
      ]);

      setBrandIdea(projectData);
      setRefineQuery(projectData.initial_phrase);
      setSuggestions(candidateData);
    } catch (err: any) {
      setError(err.message || 'We could not load your suggestions.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefine(event: FormEvent) {
    event.preventDefault();
    if (!id || !refineQuery.trim()) return;

    try {
      setGenerating(true);
      setStepIndex(0);
      setError('');
      const freshSuggestions = await api.searchDomains(id, refineQuery.trim());
      setSuggestions(freshSuggestions);
    } catch (err: any) {
      setError(err.message || 'We could not refresh these suggestions.');
    } finally {
      setGenerating(false);
    }
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
          <h1>We could not find this brand idea.</h1>
          <button className="primary-action" type="button" onClick={() => navigate('/')}>
            Start a new search
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell recommendations-shell">
      <nav className="top-nav" aria-label="Primary">
        <button className="nav-link" type="button" onClick={() => navigate('/')}>
          DotcomSeekr
        </button>
        <button className="nav-link" type="button" onClick={() => navigate('/create')}>
          New idea
        </button>
      </nav>

      <section className="recommendation-hero">
        <div>
          <p className="eyebrow">Curated suggestions</p>
          <h1>{brandIdea.name}</h1>
          <p>
            Based on: <strong>{brandIdea.initial_phrase || 'your brand idea'}</strong>
          </p>
        </div>
        <div className="confidence-card">
          <span>{topSuggestions.length}</span>
          <p>available patterns reviewed</p>
        </div>
      </section>

      <form className="refine-bar" onSubmit={handleRefine}>
        <input
          value={refineQuery}
          onChange={(event) => setRefineQuery(event.target.value)}
          placeholder="Refine the idea or try another angle"
          disabled={generating}
        />
        <button type="submit" disabled={generating || !refineQuery.trim()}>
          Refresh suggestions
        </button>
      </form>

      {generating && (
        <div className="progress-panel wide" aria-live="polite">
          <div className="progress-bar">
            <span style={{ width: `${((stepIndex + 1) / loadingSteps.length) * 100}%` }} />
          </div>
          <p>{loadingSteps[stepIndex]}</p>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

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
          <p className="eyebrow">Best options first</p>
          <h2>Recommended domains</h2>
        </div>

        {topSuggestions.length > 0 ? (
          <div className="suggestion-grid">
            {topSuggestions.map((candidate, index) => (
              <DomainSuggestionCard
                key={candidate.id}
                candidate={candidate}
                index={index}
                saved={saved.includes(candidate.id)}
                onToggleSaved={() => toggleSaved(candidate.id)}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>No suggestions yet</h2>
            <p>Refresh the idea above and we will generate a focused set of options.</p>
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
  const tier = getTier(candidate, index);
  const availability = candidate.availability_status === 'available' ? 'Available' : 'Worth checking';
  const tags = getTags(candidate, tier);
  const rationale = getRationale(candidate, tier);
  const purchaseUrl = getPurchaseUrl(candidate);

  return (
    <article className={`domain-card ${index === 0 ? 'featured' : ''}`}>
      <div className="card-topline">
        <span className={`tier-badge ${tier === 'Premium Pick' ? 'premium' : ''}`}>{tier}</span>
        <span className="availability-badge">{availability}</span>
      </div>

      <h3>{domain}</h3>
      <p>{rationale}</p>

      <div className="tag-row">
        {tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>

      <div className="card-actions">
        {purchaseUrl ? (
          <a href={purchaseUrl} target="_blank" rel="noreferrer" className="primary-action compact">
            Register
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

function getTier(candidate: Candidate, index: number): MatchTier {
  if (index === 0 || candidate.score_total >= 86) return 'Premium Pick';
  if (candidate.score_total >= 70) return 'Recommended';
  return 'Strong Match';
}

function getTags(candidate: Candidate, tier: MatchTier) {
  const tags = new Set<string>();
  tags.add(tier === 'Premium Pick' ? 'Premium Feel' : 'Strong Match');

  if (candidate.domain_name.length <= 12) tags.add('Clean & Memorable');
  if (candidate.tld === 'com') tags.add('Classic .com');
  if (candidate.tld === 'ai') tags.add('AI Friendly');
  tags.add('Brandable');

  return [...tags].slice(0, 4);
}

function getRationale(candidate: Candidate, tier: MatchTier) {
  if (tier === 'Premium Pick') {
    return 'A polished lead option with a clear startup feel and easy recall.';
  }

  if (candidate.tld === 'com') {
    return 'A familiar, trustworthy domain pattern that should feel natural to customers.';
  }

  if (candidate.tld === 'ai') {
    return 'A sharp option for an AI-led product, advisory service, or automation brand.';
  }

  return 'A concise alternative that keeps the idea flexible and easy to say.';
}

function getPurchaseUrl(candidate: Candidate) {
  const value = candidate.availability_data?.affiliateUrl;
  return typeof value === 'string' ? value : '';
}

export default JourneyExplorerPage;
