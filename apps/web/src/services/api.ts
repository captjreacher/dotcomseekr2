import { API_URL, USE_EDGE_API, edgeFunctionUrl, edgeHeaders, requestJson } from '../lib/api';

function edgeProjectsUrl(projectId?: string) {
  const url = edgeFunctionUrl('dotcomseekr-projects');
  return projectId ? `${url}?id=${encodeURIComponent(projectId)}` : url;
}

function edgeDomainSearch<T>(body: Record<string, unknown>) {
  return requestJson<T>(edgeFunctionUrl('dotcomseekr-domain-search'), {
    method: 'POST',
    headers: edgeHeaders(),
    body: JSON.stringify(body),
  });
}

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

interface EdgeProject {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  metadata?: {
    initialPhrase?: string;
    initial_phrase?: string;
    settings?: Record<string, unknown>;
  };
  created_at: string;
  updated_at: string;
}

interface EdgeDomainResult {
  id: string;
  search_id?: string;
  domain: string;
  available: boolean;
  price?: number | null;
  currency?: string;
  provider?: string;
  registrationUrl?: string | null;
  affiliate_url?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface EdgeDomainSearchResponse {
  search: {
    id: string;
    project_id: string;
    query: string;
    tlds: string[];
    provider: string;
    status: string;
    created_at: string;
  };
  results: EdgeDomainResult[];
}

export interface ExpansionOptions {
  query?: string;
  industry?: string;
  tone?: string;
  tlds?: string[];
  maxDepth?: number;
  maxNodes?: number;
  strategies?: string[];
  enablePrefixes?: boolean;
  enableSuffixes?: boolean;
  enableLLM?: boolean;
  llmTopN?: number;
  llmMode?: 'SAFE' | 'EXPLORATORY' | 'ADVENTUROUS';
  llmTone?: 'TECHNICAL' | 'BRANDABLE' | 'PLAYFUL' | 'PROFESSIONAL' | 'MODERN';
  llmMaxTokens?: number;
  llmTimeout?: number;
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
  availability_status?: string;
  availability_data?: Record<string, unknown>;
  created_at: string;
}

export interface Order {
  id: string;
  project_id: string;
  candidate_id: string;
  user_id: string;
  domain_name: string;
  tld: string;
  price_cents: number;
  is_premium: boolean;
  status: string;
  registration_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProjectGraph {
  nodes: any[];
  edges: any[];
}

function normalizeEdgeProject(project: EdgeProject): Project {
  const initialPhrase = project.metadata?.initialPhrase || project.metadata?.initial_phrase || '';

  return {
    id: project.id,
    user_id: 'edge',
    name: project.name,
    description: project.description || undefined,
    initial_phrase: initialPhrase,
    settings: project.metadata?.settings || {},
    status: project.status,
    created_at: project.created_at,
    updated_at: project.updated_at,
  };
}

function scoreDomain(domain: string, available: boolean) {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = (hash * 31 + domain.charCodeAt(i)) >>> 0;
  }

  return available ? 65 + (hash % 30) : 35 + (hash % 25);
}

function hideProviderMetadata(metadata: Record<string, unknown> = {}) {
  const neutralMetadata = { ...metadata };
  delete neutralMetadata.provider;
  delete neutralMetadata.mode;
  delete neutralMetadata.fallbackReason;
  return neutralMetadata;
}

function normalizeEdgeResult(result: EdgeDomainResult): Candidate {
  const [domainName, tld = 'com'] = result.domain.split('.');
  const score = scoreDomain(result.domain, result.available);
  const metadata = hideProviderMetadata(result.metadata);

  return {
    id: result.id,
    project_id: '',
    domain_name: domainName,
    tld,
    score_total: score,
    score_pronounceability: score,
    score_brandability: score,
    score_semantic_fit: score,
    score_technical_quality: score,
    availability_status: result.available ? 'available' : 'taken',
    availability_data: {
      price: result.price,
      currency: result.currency,
      registrationUrl: result.registrationUrl || result.affiliate_url,
      ...metadata,
    },
    created_at: result.created_at,
  };
}

export const api = {
  // Projects
  async createProject(data: {
    name: string;
    description?: string;
    initialPhrase: string;
    settings?: Record<string, unknown>;
  }): Promise<Project> {
    if (USE_EDGE_API) {
      const project = await requestJson<EdgeProject>(edgeProjectsUrl(), {
        method: 'POST',
        headers: edgeHeaders(),
        body: JSON.stringify(data),
      });
      return normalizeEdgeProject(project);
    }

    return requestJson<Project>(`${API_URL}/api/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  async getProjects(): Promise<Project[]> {
    if (USE_EDGE_API) {
      const projects = await requestJson<EdgeProject[]>(edgeProjectsUrl());
      return projects.map(normalizeEdgeProject);
    }

    return requestJson<Project[]>(`${API_URL}/api/v1/projects`);
  },

  async getProject(id: string): Promise<Project> {
    if (USE_EDGE_API) {
      const project = await requestJson<EdgeProject>(edgeProjectsUrl(id));
      return normalizeEdgeProject(project);
    }

    return requestJson<Project>(`${API_URL}/api/v1/projects/${id}`);
  },

  // Expansion
  async expand(projectId: string, options: ExpansionOptions = {}) {
    if (USE_EDGE_API) {
      return edgeDomainSearch({
        projectId,
        query: options.query,
        industry: options.industry,
        tone: options.tone,
        tlds: options.tlds,
      });
    }

    return requestJson(`${API_URL}/api/v1/projects/${projectId}/expand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
  },

  async recombine(projectId: string, options: Record<string, unknown> = {}) {
    if (USE_EDGE_API) {
      return edgeDomainSearch({
        projectId,
        query: options.query,
        industry: options.industry,
        tone: options.tone,
        tlds: options.tlds,
      });
    }

    return requestJson(`${API_URL}/api/v1/projects/${projectId}/recombine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
  },

  // Graph
  async getGraph(projectId: string): Promise<ProjectGraph> {
    if (USE_EDGE_API) {
      return { nodes: [], edges: [] };
    }

    return requestJson<ProjectGraph>(`${API_URL}/api/v1/projects/${projectId}/graph`);
  },

  // Candidates
  async getCandidates(projectId: string, minScore = 0): Promise<Candidate[]> {
    if (USE_EDGE_API) {
      const response = await edgeDomainSearch<EdgeDomainSearchResponse>({ projectId, query: '' });
      return response.results
        .map((result) => ({ ...normalizeEdgeResult(result), project_id: projectId }))
        .filter((candidate) => candidate.score_total >= minScore);
    }

    return requestJson(`${API_URL}/api/v1/projects/${projectId}/candidates?minScore=${minScore}`);
  },

  // Availability
  async checkAvailability(domain: string, tld = 'com') {
    if (USE_EDGE_API) {
      const score = scoreDomain(`${domain}.${tld}`, true);
      return {
        domain: `${domain}.${tld}`,
        available: true,
        premium: false,
        priceCents: tld === 'ai' ? 7900 : 1400,
        score,
      };
    }

    return requestJson(`${API_URL}/api/v1/availability/${domain}?tld=${tld}`);
  },

  async checkProjectAvailability(
    projectId: string,
    options: { candidateIds?: string[]; limit?: number } = {}
  ) {
    if (USE_EDGE_API) return { checked: 0, available: 0, premium: 0 };

    return requestJson(`${API_URL}/api/v1/projects/${projectId}/check-availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
  },

  async searchDomains(
    projectId: string,
    query: string,
    options: { industry?: string; tone?: string; tlds?: string[] } = {}
  ): Promise<Candidate[]> {
    if (!USE_EDGE_API) {
      await api.expand(projectId, { query, ...options });
      await api.recombine(projectId, {});
      return api.getCandidates(projectId);
    }

    const response = await edgeDomainSearch<EdgeDomainSearchResponse>({
      projectId,
      query,
      ...options,
    });
    return response.results.map((result) => ({
      ...normalizeEdgeResult(result),
      project_id: projectId,
    }));
  },

  // Orders
  async createOrder(data: {
    projectId: string;
    candidateId: string;
    domainName: string;
    tld: string;
    priceCents: number;
    isPremium: boolean;
  }): Promise<Order> {
    const response = await fetch(`${API_URL}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create order');
    return response.json();
  },

  async getProjectOrders(projectId: string): Promise<Order[]> {
    const response = await fetch(`${API_URL}/api/v1/projects/${projectId}/orders`);
    if (!response.ok) throw new Error('Failed to fetch orders');
    return response.json();
  },

  async getOrder(orderId: string): Promise<Order> {
    const response = await fetch(`${API_URL}/api/v1/orders/${orderId}`);
    if (!response.ok) throw new Error('Failed to fetch order');
    return response.json();
  },

  async cancelOrder(orderId: string): Promise<Order> {
    const response = await fetch(`${API_URL}/api/v1/orders/${orderId}/cancel`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to cancel order');
    return response.json();
  },
};
