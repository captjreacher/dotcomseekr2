import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const examples = [
  'AI automation agency',
  'bookkeeping app for tradies',
  'gaming studio',
  'health coaching platform',
];

function LandingPage() {
  const navigate = useNavigate();
  const [idea, setIdea] = useState('');

  const startDiscovery = (event: FormEvent) => {
    event.preventDefault();
    const query = idea.trim();

    if (query) {
      navigate(`/create?idea=${encodeURIComponent(query)}`);
    }
  };

  return (
    <main className="page-shell landing-shell">
      <nav className="top-nav" aria-label="Primary">
        <span className="brand-mark">DotcomSeekr</span>
        <button className="nav-link" onClick={() => navigate('/create')}>
          Start naming
        </button>
      </nav>

      <section className="hero-panel">
        <p className="eyebrow">Premium domain discovery</p>
        <h1>Find a name that feels ready to launch.</h1>
        <p className="hero-copy">
          We help founders discover memorable available domains. Start with an idea, not a
          perfect name.
        </p>

        <form className="hero-search" onSubmit={startDiscovery}>
          <label htmlFor="idea">What are you building?</label>
          <div className="hero-input-row">
            <input
              id="idea"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              placeholder="AI automation agency"
              autoComplete="off"
            />
            <button type="submit" disabled={!idea.trim()}>
              Discover names
            </button>
          </div>
        </form>

        <div className="example-row" aria-label="Example ideas">
          {examples.map((example) => (
            <button key={example} type="button" onClick={() => setIdea(example)}>
              {example}
            </button>
          ))}
        </div>
      </section>

      <section className="promise-grid" aria-label="How DotcomSeekr helps">
        <article>
          <span>01</span>
          <h2>Describe the idea</h2>
          <p>Tell us the business, audience, or vibe. Plain language is enough.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Get curated options</h2>
          <p>We turn raw availability checks into a focused set of brandable suggestions.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Shortlist with confidence</h2>
          <p>Save names that feel right and move toward registration when you are ready.</p>
        </article>
      </section>
    </main>
  );
}

export default LandingPage;
