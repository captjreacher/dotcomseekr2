import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api, Project, Candidate } from '../services/api';

interface GroupedCandidates {
  [key: string]: Candidate[];
}

function JourneyExplorerPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [graph, setGraph] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandingNodes, setExpandingNodes] = useState(false);
  const [recombining, setRecombining] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [lockedTokens, setLockedTokens] = useState<string[]>([]);

  // Settings
  const [depth, setDepth] = useState(2);
  const [minScore, setMinScore] = useState(50);
  const [maxNodes, setMaxNodes] = useState(500);

  useEffect(() => {
    loadProject();
  }, [id]);

  const loadProject = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const [projectData, graphData, candidatesData] = await Promise.all([
        api.getProject(id),
        api.getGraph(id),
        api.getCandidates(id),
      ]);

      setProject(projectData);
      setGraph(graphData);
      setCandidates(candidatesData);

      // Load locked tokens from localStorage
      const savedLocked = localStorage.getItem(`locked-tokens-${id}`);
      if (savedLocked) {
        setLockedTokens(JSON.parse(savedLocked));
      }
    } catch (error: any) {
      console.error('Failed to load project:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = async () => {
    if (!id) return;

    try {
      setExpandingNodes(true);
      await api.expand(id, {
        maxDepth: depth,
        maxNodes,
        enablePrefixes: true,
        enableSuffixes: true,
      });
      await loadProject();
    } catch (error: any) {
      console.error('Expansion failed:', error);
    } finally {
      setExpandingNodes(false);
    }
  };

  const handleRecombine = async () => {
    if (!id) return;

    try {
      setRecombining(true);
      await api.recombine(id, {
        maxLength: 20,
        minLength: 3,
        maxCandidates: 500,
      });
      await loadProject();
    } catch (error: any) {
      console.error('Recombination failed:', error);
    } finally {
      setRecombining(false);
    }
  };

  const toggleLockToken = (token: string) => {
    const newLocked = lockedTokens.includes(token)
      ? lockedTokens.filter((t) => t !== token)
      : [...lockedTokens, token];

    setLockedTokens(newLocked);

    // Persist to localStorage
    if (id) {
      localStorage.setItem(`locked-tokens-${id}`, JSON.stringify(newLocked));
    }
  };

  const groupCandidatesByScore = (): GroupedCandidates => {
    const groups: GroupedCandidates = {
      excellent: [],
      good: [],
      fair: [],
    };

    candidates
      .filter((c) => c.score_total >= minScore)
      .forEach((candidate) => {
        if (candidate.score_total >= 80) {
          groups.excellent.push(candidate);
        } else if (candidate.score_total >= 60) {
          groups.good.push(candidate);
        } else {
          groups.fair.push(candidate);
        }
      });

    return groups;
  };

  const groupedCandidates = groupCandidatesByScore();

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Project not found</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header */}
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{project.name}</h1>
        <p style={{ color: '#888' }}>
          Initial phrase: <strong>{project.initial_phrase}</strong>
        </p>
      </header>

      {/* Controls */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
          padding: '1.5rem',
          background: '#1a1a1a',
          borderRadius: '8px',
        }}
      >
        {/* Depth Control */}
        <div>
          <label
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
            }}
          >
            Depth
          </label>
          <input
            type="number"
            min="1"
            max="5"
            value={depth}
            onChange={(e) => setDepth(parseInt(e.target.value))}
            style={{
              width: '100%',
              padding: '0.5rem',
              background: '#0a0a0a',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff',
            }}
          />
        </div>

        {/* Max Nodes */}
        <div>
          <label
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
            }}
          >
            Max Nodes
          </label>
          <input
            type="number"
            min="50"
            max="2000"
            step="50"
            value={maxNodes}
            onChange={(e) => setMaxNodes(parseInt(e.target.value))}
            style={{
              width: '100%',
              padding: '0.5rem',
              background: '#0a0a0a',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff',
            }}
          />
        </div>

        {/* Min Score Filter */}
        <div>
          <label
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
            }}
          >
            Min Score
          </label>
          <input
            type="number"
            min="0"
            max="100"
            value={minScore}
            onChange={(e) => setMinScore(parseInt(e.target.value))}
            style={{
              width: '100%',
              padding: '0.5rem',
              background: '#0a0a0a',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff',
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            onClick={handleExpand}
            disabled={expandingNodes}
            style={{
              padding: '0.5rem',
              background: expandingNodes ? '#444' : '#0066ff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: expandingNodes ? 'not-allowed' : 'pointer',
            }}
          >
            {expandingNodes ? 'Expanding...' : 'Expand Nodes'}
          </button>
          <button
            onClick={handleRecombine}
            disabled={recombining}
            style={{
              padding: '0.5rem',
              background: recombining ? '#444' : '#00aa00',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: recombining ? 'not-allowed' : 'pointer',
            }}
          >
            {recombining ? 'Recombining...' : 'Recombine'}
          </button>
        </div>
      </div>

      {/* Graph Stats */}
      {graph && (
        <div
          style={{
            display: 'flex',
            gap: '2rem',
            marginBottom: '2rem',
            padding: '1rem',
            background: '#1a1a1a',
            borderRadius: '8px',
          }}
        >
          <div>
            <span style={{ color: '#888' }}>Nodes:</span>{' '}
            <strong>{graph.nodes.length}</strong>
          </div>
          <div>
            <span style={{ color: '#888' }}>Edges:</span>{' '}
            <strong>{graph.edges.length}</strong>
          </div>
          <div>
            <span style={{ color: '#888' }}>Candidates:</span>{' '}
            <strong>{candidates.length}</strong>
          </div>
          <div>
            <span style={{ color: '#888' }}>Locked Tokens:</span>{' '}
            <strong>{lockedTokens.length}</strong>
          </div>
        </div>
      )}

      {/* Locked Tokens */}
      {lockedTokens.length > 0 && (
        <div
          style={{
            marginBottom: '2rem',
            padding: '1rem',
            background: '#1a1a1a',
            borderRadius: '8px',
          }}
        >
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Locked Tokens</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {lockedTokens.map((token) => (
              <span
                key={token}
                onClick={() => toggleLockToken(token)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#0066ff',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                🔒 {token}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Grouped Candidates */}
      <div>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>Domain Candidates</h2>

        {/* Excellent */}
        {groupedCandidates.excellent.length > 0 && (
          <section style={{ marginBottom: '2rem' }}>
            <h3
              style={{
                marginBottom: '1rem',
                fontSize: '1.25rem',
                color: '#00ff00',
              }}
            >
              Excellent (80-100) - {groupedCandidates.excellent.length} candidates
            </h3>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {groupedCandidates.excellent.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  selected={selectedCandidate?.id === candidate.id}
                  onSelect={() => setSelectedCandidate(candidate)}
                  onLockToken={toggleLockToken}
                  lockedTokens={lockedTokens}
                />
              ))}
            </div>
          </section>
        )}

        {/* Good */}
        {groupedCandidates.good.length > 0 && (
          <section style={{ marginBottom: '2rem' }}>
            <h3
              style={{
                marginBottom: '1rem',
                fontSize: '1.25rem',
                color: '#ffaa00',
              }}
            >
              Good (60-79) - {groupedCandidates.good.length} candidates
            </h3>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {groupedCandidates.good.slice(0, 20).map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  selected={selectedCandidate?.id === candidate.id}
                  onSelect={() => setSelectedCandidate(candidate)}
                  onLockToken={toggleLockToken}
                  lockedTokens={lockedTokens}
                />
              ))}
            </div>
          </section>
        )}

        {/* Fair */}
        {groupedCandidates.fair.length > 0 && (
          <section style={{ marginBottom: '2rem' }}>
            <h3
              style={{
                marginBottom: '1rem',
                fontSize: '1.25rem',
                color: '#888',
              }}
            >
              Fair ({minScore}-59) - {groupedCandidates.fair.length} candidates
            </h3>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {groupedCandidates.fair.slice(0, 10).map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  selected={selectedCandidate?.id === candidate.id}
                  onSelect={() => setSelectedCandidate(candidate)}
                  onLockToken={toggleLockToken}
                  lockedTokens={lockedTokens}
                />
              ))}
            </div>
          </section>
        )}

        {candidates.filter((c) => c.score_total >= minScore).length === 0 && (
          <p style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>
            No candidates found. Try lowering the minimum score or generating more candidates.
          </p>
        )}
      </div>
    </div>
  );
}

interface CandidateCardProps {
  candidate: Candidate;
  selected: boolean;
  onSelect: () => void;
  onLockToken: (token: string) => void;
  lockedTokens: string[];
}

function CandidateCard({
  candidate,
  selected,
  onSelect,
  onLockToken,
  lockedTokens,
}: CandidateCardProps) {
  const tokens = candidate.domain_name.split(/(?=[A-Z])|[-_\s]+/);

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '1.5rem',
        background: selected ? '#1a3a5a' : '#1a1a1a',
        border: `2px solid ${selected ? '#0066ff' : '#333'}`,
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <h4 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
            {candidate.domain_name}.{candidate.tld}
          </h4>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {tokens.map((token, idx) => {
              const isLocked = lockedTokens.includes(token.toLowerCase());
              return (
                <span
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    onLockToken(token.toLowerCase());
                  }}
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: isLocked ? '#0066ff' : '#333',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  {isLocked && '🔒 '}
                  {token}
                </span>
              );
            })}
          </div>
        </div>
        <div
          style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            color: candidate.score_total >= 80 ? '#00ff00' : '#ffaa00',
          }}
        >
          {candidate.score_total.toFixed(0)}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '0.5rem',
          fontSize: '0.875rem',
        }}
      >
        <div>
          <span style={{ color: '#888' }}>Pronounce:</span>{' '}
          {candidate.score_pronounceability.toFixed(1)}
        </div>
        <div>
          <span style={{ color: '#888' }}>Brand:</span> {candidate.score_brandability.toFixed(1)}
        </div>
        <div>
          <span style={{ color: '#888' }}>Semantic:</span>{' '}
          {candidate.score_semantic_fit.toFixed(1)}
        </div>
        <div>
          <span style={{ color: '#888' }}>Technical:</span>{' '}
          {candidate.score_technical_quality.toFixed(1)}
        </div>
      </div>
    </div>
  );
}

export default JourneyExplorerPage;
