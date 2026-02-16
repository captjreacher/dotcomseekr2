import { Link } from 'react-router-dom';

function LandingPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>
          DotcomSeekr
        </h1>
        <p style={{ fontSize: '1.5rem', color: '#888', marginBottom: '2rem' }}>
          Domain Intelligence Engine
        </p>
        <Link
          to="/create"
          style={{
            display: 'inline-block',
            padding: '1rem 2rem',
            fontSize: '1.125rem',
            fontWeight: 'bold',
            background: '#0066ff',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '4px',
          }}
        >
          Create New Project
        </Link>
      </header>

      <main>
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>
            Semantic Graph-Powered Domain Discovery
          </h2>
          <p style={{ color: '#aaa', lineHeight: '1.6' }}>
            DotcomSeekr is a pure SaaS domain intelligence platform that combines
            deterministic lexicon expansion with AI enrichment to discover perfect
            domain names through semantic graph traversal.
          </p>
        </section>

        <section>
          <h3 style={{ marginBottom: '1rem' }}>Features</h3>
          <ul style={{ color: '#aaa', lineHeight: '2' }}>
            <li>🧠 Hybrid intelligence: Deterministic + LLM enrichment</li>
            <li>🕸️ Persisted semantic graph traversal</li>
            <li>🎯 Advanced domain scoring and grouping</li>
            <li>📊 Interactive journey exploration</li>
            <li>🔍 Branch expansion from any node</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

export default LandingPage;
