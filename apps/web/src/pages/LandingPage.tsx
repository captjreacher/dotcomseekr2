import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const examples = ['agent', 'automation', 'tradie', 'ledger', 'groovy'];
const tones = ['clean', 'premium', 'playful', 'technical', 'bold'];
const tldOptions = ['com', 'ai', 'io', 'co', 'net', 'org'];

function LandingPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [industry, setIndustry] = useState('');
  const [tone, setTone] = useState('clean');
  const [selectedTlds, setSelectedTlds] = useState(['com', 'ai', 'io']);

  const startDiscovery = (event: FormEvent) => {
    event.preventDefault();
    const query = keyword.trim();

    if (query) {
      const params = new URLSearchParams({
        idea: query,
        tone,
        tlds: selectedTlds.join(','),
      });

      if (industry.trim()) {
        params.set('industry', industry.trim());
      }

      navigate(`/create?${params.toString()}`);
    }
  };

  const toggleTld = (tld: string) => {
    setSelectedTlds((current) => {
      if (current.includes(tld)) {
        return current.length === 1 ? current : current.filter((item) => item !== tld);
      }

      return [...current, tld];
    });
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
          Enter one word or phrase. DotcomSeekr expands it into smart, brandable domain ideas.
        </p>

        <form className="hero-search" onSubmit={startDiscovery}>
          <label htmlFor="keyword">Start with a keyword</label>
          <div className="hero-input-row">
            <input
              id="keyword"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="agent"
              autoComplete="off"
            />
            <button type="submit" disabled={!keyword.trim()}>
              Discover names
            </button>
          </div>

          <div className="optional-fields">
            <label htmlFor="industry">Industry / use case</label>
            <input
              id="industry"
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              placeholder="Optional, e.g. finance, AI agents, trades"
              autoComplete="off"
            />
          </div>

          <div className="chip-group" aria-label="Tone">
            <span>Tone</span>
            {tones.map((toneOption) => (
              <button
                key={toneOption}
                type="button"
                className={tone === toneOption ? 'active' : ''}
                onClick={() => setTone(toneOption)}
              >
                {toneOption}
              </button>
            ))}
          </div>

          <div className="chip-group" aria-label="TLDs">
            <span>TLDs</span>
            {tldOptions.map((tld) => (
              <button
                key={tld}
                type="button"
                className={selectedTlds.includes(tld) ? 'active' : ''}
                onClick={() => toggleTld(tld)}
              >
                .{tld}
              </button>
            ))}
          </div>
        </form>

        <div className="example-row" aria-label="Example keywords">
          {examples.map((example) => (
            <button key={example} type="button" onClick={() => setKeyword(example)}>
              {example}
            </button>
          ))}
        </div>
      </section>

      <section className="promise-grid" aria-label="How DotcomSeekr helps">
        <article>
          <span>01</span>
          <h2>Start with a seed word</h2>
          <p>Enter the keyword you want your naming search to orbit around.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Generate smart permutations</h2>
          <p>Explore prefixes, suffixes, related words, compounds, and brandable wordplay.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Check and shortlist available domains</h2>
          <p>Compare available options across your preferred TLDs and save the best fits.</p>
        </article>
      </section>
    </main>
  );
}

export default LandingPage;
