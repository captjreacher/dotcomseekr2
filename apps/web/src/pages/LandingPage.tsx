import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SiteHeader from '../components/SiteHeader';
import ReticleFocus from '../components/ReticleFocus';
import QuickCheckPanel from '../components/QuickCheckPanel';
import { BRAND_TAGLINE } from '../brand';

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

  const focusAssistedSearch = () => {
    const workbench = document.getElementById('assisted-search');
    workbench?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    workbench?.querySelector<HTMLInputElement>('#keyword')?.focus({ preventScroll: true });
  };

  const focusQuickCheck = () => {
    const workbench = document.getElementById('quick-check');
    workbench?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    workbench?.querySelector<HTMLInputElement>('#quick-check-domain')?.focus({ preventScroll: true });
  };

  return (
    <main className="page-shell landing-shell">
      <SiteHeader />

      <section className="hero-panel">
        <ReticleFocus className="hero-reticle" watermark state="broad" />
        <div className="hero-content">
          <p className="eyebrow">Premium domain discovery</p>
          <p className="hero-tagline">{BRAND_TAGLINE}</p>
          <h1>Find the domain that&rsquo;s actually worth registering.</h1>
          <p className="hero-copy">
            DotcomSeekr explores, eliminates and refines until strong available domains remain.
          </p>
          <div className="hero-actions">
            <button className="primary-action" type="button" onClick={focusAssistedSearch}>
              Start assisted search
            </button>
            <button className="secondary-action" type="button" onClick={() => navigate('/create')}>
              Continue with a starting word
            </button>
          </div>
        </div>
      </section>

      <section className="path-grid" aria-label="Two ways to search">
        <article className="path-card">
          <span className="path-badge">Quick Check</span>
          <h2>Check one exact domain.</h2>
          <p>Type a specific name and see whether it is available before you commit to it.</p>
          <button className="path-action" type="button" onClick={focusQuickCheck}>
            Check a domain
          </button>
        </article>
        <article className="path-card">
          <span className="path-badge">Assisted Search</span>
          <h2>Explore, eliminate and refine until we find strong available domains.</h2>
          <p>
            Give us your core words and we will generate, check and shortlist the options worth your
            attention.
          </p>
          <button className="path-action" type="button" onClick={focusAssistedSearch}>
            Begin assisted search
          </button>
        </article>
      </section>

      <section className="quick-check-workbench" id="quick-check" aria-label="Quick Check">
        <QuickCheckPanel />
      </section>

      <section className="search-workbench" id="assisted-search" aria-label="Assisted search">
        <div className="section-heading">
          <p className="eyebrow">Assisted search</p>
          <h2>Start with your core words</h2>
        </div>

        <form className="hero-search" onSubmit={startDiscovery}>
          <label htmlFor="keyword">Starting words</label>
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

        <div className="example-row" aria-label="Example starting words">
          {examples.map((example) => (
            <button key={example} type="button" onClick={() => setKeyword(example)}>
              {example}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

export default LandingPage;
