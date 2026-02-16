import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

function CreateProjectPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    initialPhrase: '',
  });
  const [expansionSettings, setExpansionSettings] = useState({
    maxDepth: 2,
    maxNodes: 500,
    enablePrefixes: true,
    enableSuffixes: true,
    enableLLM: false,
    llmTopN: 10,
    llmMode: 'EXPLORATORY' as 'SAFE' | 'EXPLORATORY' | 'ADVENTUROUS',
    llmTone: 'BRANDABLE' as
      | 'TECHNICAL'
      | 'BRANDABLE'
      | 'PLAYFUL'
      | 'PROFESSIONAL'
      | 'MODERN',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Create project
      const project = await api.createProject({
        name: formData.name,
        description: formData.description,
        initialPhrase: formData.initialPhrase,
        settings: expansionSettings,
      });

      // Trigger expansion
      await api.expand(project.id, expansionSettings);

      // Navigate to journey explorer
      navigate(`/project/${project.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '2rem' }}>Create New Project</h1>

      <form onSubmit={handleSubmit}>
        {/* Project Details */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Project Details</h2>

          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="name"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}
            >
              Project Name *
            </label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                border: '1px solid #333',
                borderRadius: '4px',
                background: '#1a1a1a',
                color: '#fff',
              }}
              placeholder="e.g., CloudSync Project"
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="description"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}
            >
              Description
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                border: '1px solid #333',
                borderRadius: '4px',
                background: '#1a1a1a',
                color: '#fff',
              }}
              placeholder="Optional project description"
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="initialPhrase"
              style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}
            >
              Initial Phrase *
            </label>
            <input
              id="initialPhrase"
              type="text"
              value={formData.initialPhrase}
              onChange={(e) => setFormData({ ...formData, initialPhrase: e.target.value })}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                border: '1px solid #333',
                borderRadius: '4px',
                background: '#1a1a1a',
                color: '#fff',
              }}
              placeholder="e.g., cloud sync data"
            />
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#888' }}>
              The seed phrase that will be expanded into domain candidates
            </p>
          </div>
        </section>

        {/* Expansion Settings */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Expansion Settings</h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              marginBottom: '1rem',
            }}
          >
            <div>
              <label
                htmlFor="maxDepth"
                style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}
              >
                Max Depth
              </label>
              <input
                id="maxDepth"
                type="number"
                min="1"
                max="5"
                value={expansionSettings.maxDepth}
                onChange={(e) =>
                  setExpansionSettings({
                    ...expansionSettings,
                    maxDepth: parseInt(e.target.value),
                  })
                }
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  background: '#1a1a1a',
                  color: '#fff',
                }}
              />
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#888' }}>
                How many levels deep to expand (1-5)
              </p>
            </div>

            <div>
              <label
                htmlFor="maxNodes"
                style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}
              >
                Max Nodes
              </label>
              <input
                id="maxNodes"
                type="number"
                min="50"
                max="2000"
                step="50"
                value={expansionSettings.maxNodes}
                onChange={(e) =>
                  setExpansionSettings({
                    ...expansionSettings,
                    maxNodes: parseInt(e.target.value),
                  })
                }
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  background: '#1a1a1a',
                  color: '#fff',
                }}
              />
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#888' }}>
                Maximum number of nodes to generate
              </p>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={expansionSettings.enablePrefixes}
                onChange={(e) =>
                  setExpansionSettings({
                    ...expansionSettings,
                    enablePrefixes: e.target.checked,
                  })
                }
                style={{ marginRight: '0.5rem', width: '1.25rem', height: '1.25rem' }}
              />
              <span>Enable morphological prefixes (micro, ultra, super, etc.)</span>
            </label>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={expansionSettings.enableSuffixes}
                onChange={(e) =>
                  setExpansionSettings({
                    ...expansionSettings,
                    enableSuffixes: e.target.checked,
                  })
                }
                style={{ marginRight: '0.5rem', width: '1.25rem', height: '1.25rem' }}
              />
              <span>Enable morphological suffixes (ify, hub, kit, etc.)</span>
            </label>
          </div>
        </section>

        {/* LLM Enrichment Settings */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
            LLM Enrichment (Optional)
          </h2>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={expansionSettings.enableLLM}
                onChange={(e) =>
                  setExpansionSettings({
                    ...expansionSettings,
                    enableLLM: e.target.checked,
                  })
                }
                style={{ marginRight: '0.5rem', width: '1.25rem', height: '1.25rem' }}
              />
              <span>Enable AI-powered semantic enrichment</span>
            </label>
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#888' }}>
              Uses Claude AI to discover creative alternatives beyond the lexicon
            </p>
          </div>

          {expansionSettings.enableLLM && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1rem',
                  marginBottom: '1rem',
                }}
              >
                <div>
                  <label
                    htmlFor="llmMode"
                    style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}
                  >
                    Exploration Mode
                  </label>
                  <select
                    id="llmMode"
                    value={expansionSettings.llmMode}
                    onChange={(e) =>
                      setExpansionSettings({
                        ...expansionSettings,
                        llmMode: e.target.value as any,
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      fontSize: '1rem',
                      border: '1px solid #333',
                      borderRadius: '4px',
                      background: '#1a1a1a',
                      color: '#fff',
                    }}
                  >
                    <option value="SAFE">Safe - Conservative expansions</option>
                    <option value="EXPLORATORY">Exploratory - Balanced creativity</option>
                    <option value="ADVENTUROUS">Adventurous - Maximum creativity</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="llmTone"
                    style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}
                  >
                    Tone
                  </label>
                  <select
                    id="llmTone"
                    value={expansionSettings.llmTone}
                    onChange={(e) =>
                      setExpansionSettings({
                        ...expansionSettings,
                        llmTone: e.target.value as any,
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      fontSize: '1rem',
                      border: '1px solid #333',
                      borderRadius: '4px',
                      background: '#1a1a1a',
                      color: '#fff',
                    }}
                  >
                    <option value="TECHNICAL">Technical</option>
                    <option value="BRANDABLE">Brandable</option>
                    <option value="PLAYFUL">Playful</option>
                    <option value="PROFESSIONAL">Professional</option>
                    <option value="MODERN">Modern</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="llmTopN"
                  style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}
                >
                  Top N Nodes to Enrich
                </label>
                <input
                  id="llmTopN"
                  type="number"
                  min="5"
                  max="50"
                  value={expansionSettings.llmTopN}
                  onChange={(e) =>
                    setExpansionSettings({
                      ...expansionSettings,
                      llmTopN: parseInt(e.target.value),
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    fontSize: '1rem',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    background: '#1a1a1a',
                    color: '#fff',
                  }}
                />
                <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#888' }}>
                  How many of the best nodes to send to AI for enrichment (5-50)
                </p>
              </div>
            </>
          )}
        </section>

        {/* Error Display */}
        {error && (
          <div
            style={{
              padding: '1rem',
              marginBottom: '1rem',
              background: '#ff000020',
              border: '1px solid #ff0000',
              borderRadius: '4px',
              color: '#ff6b6b',
            }}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 1,
              padding: '1rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              background: loading ? '#444' : '#0066ff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Creating & Expanding...' : 'Create Project'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/')}
            disabled={loading}
            style={{
              padding: '1rem 2rem',
              fontSize: '1rem',
              background: 'transparent',
              color: '#888',
              border: '1px solid #333',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateProjectPage;
