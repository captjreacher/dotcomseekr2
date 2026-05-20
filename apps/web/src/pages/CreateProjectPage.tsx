import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';

const progressSteps = [
  'Reading the seed keyword...',
  'Generating smart permutations...',
  'Checking availability...',
  'Curating the best matches...',
];

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!loading) return;

    const timer = window.setInterval(() => {
      setStepIndex((current) => Math.min(current + 1, progressSteps.length - 1));
    }, 850);

    return () => window.clearInterval(timer);
  }, [loading]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedIdea = idea.trim();

    if (!trimmedIdea) return;

    setError('');
    setLoading(true);
    setStepIndex(0);

    try {
      const project = await api.createProject({
        name: brandName.trim() || trimmedIdea,
        description: 'Seed keyword created in DotcomSeekr',
        initialPhrase: trimmedIdea,
        settings: { source: 'keyword-discovery', industry, tone, tlds: selectedTlds },
      });

      await api.searchDomains(project.id, trimmedIdea, {
        industry,
        tone,
        tlds: selectedTlds,
      });
      navigate(`/ideas/${project.id}`);
    } catch (err: any) {
      setError(err.message || 'We could not generate suggestions. Please try again.');
      setLoading(false);
    }
  };

  return (
    <main className="page-shell create-shell">
      <button className="back-link" type="button" onClick={() => navigate('/')}>
        Back
      </button>

      <section className="create-layout">
        <div className="create-copy">
          <p className="eyebrow">Guided discovery</p>
          <h1>Start with a seed word. We will explore the naming territory.</h1>
          <p>
            Enter one word or phrase. DotcomSeekr will try exact matches, useful modifiers,
            related concepts, and brandable variants before checking availability.
          </p>
        </div>

        <form className="discovery-form" onSubmit={handleSubmit}>
          <label htmlFor="idea">Start with a keyword</label>
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

          {loading && (
            <div className="progress-panel" aria-live="polite">
              <div className="progress-bar">
                <span style={{ width: `${((stepIndex + 1) / progressSteps.length) * 100}%` }} />
              </div>
              <p>{progressSteps[stepIndex]}</p>
            </div>
          )}

          {error && <p className="form-error">{error}</p>}

          <button className="primary-action" type="submit" disabled={loading || !idea.trim()}>
            {loading ? 'Finding your best options' : 'Generate suggestions'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default CreateProjectPage;
