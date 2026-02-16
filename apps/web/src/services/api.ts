const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  initial_phrase: string;
  settings: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ExpansionOptions {
  maxDepth?: number;
  maxNodes?: number;
  strategies?: string[];
  enablePrefixes?: boolean;
  enableSuffixes?: boolean;
}

export interface Candidate {
  id: string;
  project_id: string;
  domain_name: string;
  tld: string;
  score_total: number;
  score_pronounceability: number;
  score_brandability: number;
  score_semantic_fit: number;
  score_technical_quality: number;
  created_at: string;
}

export const api = {
  // Projects
  async createProject(data: {
    name: string;
    description?: string;
    initialPhrase: string;
    settings?: Record<string, unknown>;
  }): Promise<Project> {
    const response = await fetch(`${API_URL}/api/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create project');
    return response.json();
  },

  async getProjects(): Promise<Project[]> {
    const response = await fetch(`${API_URL}/api/v1/projects`);
    if (!response.ok) throw new Error('Failed to fetch projects');
    return response.json();
  },

  async getProject(id: string): Promise<Project> {
    const response = await fetch(`${API_URL}/api/v1/projects/${id}`);
    if (!response.ok) throw new Error('Failed to fetch project');
    return response.json();
  },

  // Expansion
  async expand(projectId: string, options: ExpansionOptions = {}) {
    const response = await fetch(`${API_URL}/api/v1/projects/${projectId}/expand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!response.ok) throw new Error('Failed to expand');
    return response.json();
  },

  async recombine(projectId: string, options: Record<string, unknown> = {}) {
    const response = await fetch(`${API_URL}/api/v1/projects/${projectId}/recombine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!response.ok) throw new Error('Failed to recombine');
    return response.json();
  },

  // Graph
  async getGraph(projectId: string) {
    const response = await fetch(`${API_URL}/api/v1/projects/${projectId}/graph`);
    if (!response.ok) throw new Error('Failed to fetch graph');
    return response.json();
  },

  // Candidates
  async getCandidates(projectId: string, minScore = 0): Promise<Candidate[]> {
    const response = await fetch(
      `${API_URL}/api/v1/projects/${projectId}/candidates?minScore=${minScore}`
    );
    if (!response.ok) throw new Error('Failed to fetch candidates');
    return response.json();
  },
};
