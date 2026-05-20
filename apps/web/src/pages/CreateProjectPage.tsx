import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';

const progressSteps = [
  'Analyzing brand direction...',
  'Finding strong domain patterns...',
  'Checking availability...',
  'Curating the best matches...',
];

function CreateProjectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [idea, setIdea] = useState(searchParams.get('idea') || '');
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
        description: 'Brand idea created in DotcomSeekr',
        initialPhrase: trimmedIdea,
        settings: { source: 'guided-discovery' },
      });

      await api.searchDomains(project.id, trimmedIdea);
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
          <h1>Start with the idea. We will shape the naming direction.</h1>
          <p>
            Describe what you are building in a sentence or two. DotcomSeekr will look for
            clean, memorable domains and surface the strongest options first.
          </p>
        </div>

        <form className="discovery-form" onSubmit={handleSubmit}>
          <label htmlFor="idea">What are you building?</label>
          <textarea
            id="idea"
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            placeholder="A modern bookkeeping app for trade businesses"
            rows={5}
            disabled={loading}
            required
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
