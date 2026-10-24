import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SearchProgress, { SearchStage } from '../components/SearchProgress';
import SiteHeader from '../components/SiteHeader';
import { isRequestAborted, isRequestTimeout } from '../lib/request';
import { api } from '../services/api';

interface CreatedProject {
  signature: string;
  id: string;
}

function CreateProjectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [idea, setIdea] = useState(searchParams.get('idea') || '');
  const [industry, setIndustry] = useState(searchParams.get('industry') || '');
  const [tone, setTone] = useState(searchParams.get('tone') || 'clean');
  const selectedTlds = (searchParams.get('tlds') || 'com,ai,io')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const [brandName, setBrandName] = useState('');
  const [stage, setStage] = useState<SearchStage | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState('');

  const attemptRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const createdProjectRef = useRef<CreatedProject | null>(null);

  const loading = stage !== null;

  useEffect(() => {
    if (!stage) return;

    const startedAt = Date.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [stage]);

  useEffect(() => {
    return () => {
      attemptRef.current += 1;
      controllerRef.current?.abort();
    };
  }, []);

  async function runSearch() {
    const trimmedIdea = idea.trim();

    if (!trimmedIdea) return;

    const signature = JSON.stringify({
      idea: trimmedIdea,
      industry,
      tone,
      tlds: selectedTlds,
      brandName: brandName.trim(),
    });

    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    setError('');
    setStage('creating');

    try {
      // Reuse the project from a failed attempt so retrying cannot create a duplicate.
      let projectId =
        createdProjectRef.current?.signature === signature ? createdProjectRef.current.id : null;

      if (!projectId) {
        const project = await api.createProject(
          {
            name: brandName.trim() || trimmedIdea,
            description: 'Core words created in DotcomSeekr',
            initialPhrase: trimmedIdea,
            settings: { source: 'keyword-discovery', industry, tone, tlds: selectedTlds },
          },
          { signal: controller.signal }
        );

        if (attempt !== attemptRef.current) return;

        projectId = project.id;
        createdProjectRef.current = { signature, id: projectId };
      }

      setStage('searching');

      await api.searchDomains(projectId, trimmedIdea, {
        industry,
        tone,
        tlds: selectedTlds,
        signal: controller.signal,
      });

      // A timed-out or superseded attempt must never navigate.
      if (attempt !== attemptRef.current) return;

      setStage(null);
      navigate(`/ideas/${projectId}`);
    } catch (err) {
      if (attempt !== attemptRef.current || isRequestAborted(err)) return;

      setStage(null);
      setError(describeFailure(err));
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void runSearch();
  };

  return (
    <main className="page-shell create-shell">
      <SiteHeader
        actions={
          <button className="nav-link" type="button" onClick={() => navigate('/')}>
            Back
          </button>
        }
      />

      <section className="create-layout">
        <div className="create-copy">
          <p className="eyebrow">Guided discovery</p>
          <h1>Start with core words. We will explore the naming territory.</h1>
          <p>
            Enter one word or phrase. DotcomSeekr will try exact matches, useful modifiers,
            related concepts, and brandable variants before checking availability.
          </p>
        </div>

        <form className="discovery-form" onSubmit={handleSubmit}>
          <label htmlFor="idea">Starting words</label>
          <textarea
            id="idea"
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            placeholder="agent"
            rows={3}
            disabled={loading}
            required
          />

          <label htmlFor="industry">Industry / use case</label>
          <input
            id="industry"
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
            placeholder="Optional"
            disabled={loading}
          />

          <label htmlFor="tone">Tone</label>
          <input
            id="tone"
            value={tone}
            onChange={(event) => setTone(event.target.value)}
            placeholder="clean, premium, playful, technical, bold"
            disabled={loading}
          />

          <label htmlFor="brandName">Working name, if you have one</label>
          <input
            id="brandName"
            value={brandName}
            onChange={(event) => setBrandName(event.target.value)}
            placeholder="Optional"
            disabled={loading}
          />

          {stage && <SearchProgress stage={stage} elapsedSeconds={elapsedSeconds} />}

          {error && !loading && (
            <div className="form-error-panel" role="alert">
              <p className="form-error">{error}</p>
              <button
                className="secondary-action compact"
                type="button"
                onClick={() => void runSearch()}
              >
                Try again
              </button>
            </div>
          )}

          <button className="primary-action" type="submit" disabled={loading || !idea.trim()}>
            {loading
              ? stage === 'creating'
                ? 'Creating your search...'
                : 'Finding your best options'
              : 'Generate suggestions'}
          </button>
        </form>
      </section>
    </main>
  );
}

function describeFailure(error: unknown) {
  if (isRequestTimeout(error)) {
    return 'Live availability checks took too long, so we stopped waiting. Please try again.';
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'We could not generate suggestions. Please try again.';
}

export default CreateProjectPage;
