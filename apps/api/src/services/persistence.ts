import { getSupabaseClient } from './supabase';
import { randomUUID } from 'crypto';

export interface CreateProjectData {
  userId: string;
  name: string;
  description?: string;
  initialPhrase: string;
  settings?: Record<string, unknown>;
}

export interface GraphNodeData {
  projectId: string;
  nodeType: string;
  value: string;
  normalizedValue: string;
  semanticWeight: number;
  depthLevel: number;
  metadata?: Record<string, unknown>;
}

export interface GraphEdgeData {
  projectId: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: string;
  weight: number;
  sourceSystem: string;
  sourceConfidence: number;
  metadata?: Record<string, unknown>;
}

export interface CandidateData {
  projectId: string;
  domainName: string;
  tld: string;
  sourceNodeIds: string[];
  recombinationStrategy: string;
  scoreTotal: number;
  scorePronounceability: number;
  scoreBrandability: number;
  scoreSemanticFit: number;
  scoreTechnicalQuality: number;
  scoringMetadata?: Record<string, unknown>;
}

export interface EventData {
  projectId: string;
  userId: string;
  eventType: string;
  payload: Record<string, unknown>;
  success?: boolean;
  errorMessage?: string;
  durationMs?: number;
}

/**
 * Persistence service for database operations
 */
export class PersistenceService {
  private supabase = getSupabaseClient();

  /**
   * Create a new project
   */
  async createProject(data: CreateProjectData) {
    const { data: project, error } = await this.supabase
      .from('projects')
      .insert({
        user_id: data.userId,
        name: data.name,
        description: data.description,
        initial_phrase: data.initialPhrase,
        settings: data.settings || {},
        status: 'active',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create project: ${error.message}`);
    return project;
  }

  /**
   * Get project by ID
   */
  async getProject(projectId: string) {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error) throw new Error(`Failed to get project: ${error.message}`);
    return data;
  }

  /**
   * Update project
   */
  async updateProject(projectId: string, updates: Partial<CreateProjectData>) {
    const { data, error } = await this.supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update project: ${error.message}`);
    return data;
  }

  /**
   * Batch insert graph nodes
   */
  async saveGraphNodes(nodes: GraphNodeData[]) {
    if (nodes.length === 0) return [];

    const records = nodes.map((node) => ({
      id: randomUUID(),
      project_id: node.projectId,
      node_type: node.nodeType,
      value: node.value,
      normalized_value: node.normalizedValue,
      semantic_weight: node.semanticWeight,
      depth_level: node.depthLevel,
      is_terminal: false,
      metadata: node.metadata || {},
    }));

    const { data, error } = await this.supabase
      .from('graph_nodes')
      .insert(records)
      .select();

    if (error) throw new Error(`Failed to save graph nodes: ${error.message}`);
    return data;
  }

  /**
   * Batch insert graph edges
   */
  async saveGraphEdges(edges: GraphEdgeData[]) {
    if (edges.length === 0) return [];

    const records = edges.map((edge) => ({
      id: randomUUID(),
      project_id: edge.projectId,
      source_node_id: edge.sourceNodeId,
      target_node_id: edge.targetNodeId,
      edge_type: edge.edgeType,
      weight: edge.weight,
      source_system: edge.sourceSystem,
      source_confidence: edge.sourceConfidence,
      metadata: edge.metadata || {},
    }));

    const { data, error } = await this.supabase
      .from('graph_edges')
      .insert(records)
      .select();

    if (error) throw new Error(`Failed to save graph edges: ${error.message}`);
    return data;
  }

  /**
   * Get graph for a project
   */
  async getGraph(projectId: string) {
    const [nodesResult, edgesResult] = await Promise.all([
      this.supabase.from('graph_nodes').select('*').eq('project_id', projectId),
      this.supabase.from('graph_edges').select('*').eq('project_id', projectId),
    ]);

    if (nodesResult.error)
      throw new Error(`Failed to load nodes: ${nodesResult.error.message}`);
    if (edgesResult.error)
      throw new Error(`Failed to load edges: ${edgesResult.error.message}`);

    return {
      nodes: nodesResult.data,
      edges: edgesResult.data,
    };
  }

  /**
   * Batch insert candidates
   */
  async saveCandidates(candidates: CandidateData[]) {
    if (candidates.length === 0) return [];

    const records = candidates.map((candidate) => ({
      id: randomUUID(),
      project_id: candidate.projectId,
      domain_name: candidate.domainName,
      tld: candidate.tld,
      source_node_ids: candidate.sourceNodeIds,
      recombination_strategy: candidate.recombinationStrategy,
      score_total: candidate.scoreTotal,
      score_pronounceability: candidate.scorePronounceability,
      score_brandability: candidate.scoreBrandability,
      score_semantic_fit: candidate.scoreSemanticFit,
      score_technical_quality: candidate.scoreTechnicalQuality,
      scoring_metadata: candidate.scoringMetadata || {},
      availability_status: 'unknown',
    }));

    const { data, error } = await this.supabase.from('candidates').insert(records).select();

    if (error) throw new Error(`Failed to save candidates: ${error.message}`);
    return data;
  }

  /**
   * Get candidates for a project
   */
  async getCandidates(projectId: string, minScore = 0) {
    const { data, error } = await this.supabase
      .from('candidates')
      .select('*')
      .eq('project_id', projectId)
      .gte('score_total', minScore)
      .order('score_total', { ascending: false });

    if (error) throw new Error(`Failed to get candidates: ${error.message}`);
    return data;
  }

  /**
   * Log an event
   */
  async logEvent(event: EventData) {
    const { error } = await this.supabase.from('events').insert({
      project_id: event.projectId,
      user_id: event.userId,
      event_type: event.eventType,
      payload: event.payload,
      success: event.success !== false,
      error_message: event.errorMessage,
      duration_ms: event.durationMs,
    });

    if (error) {
      console.error('Failed to log event:', error);
      // Don't throw - logging failures shouldn't break the flow
    }
  }

  /**
   * Get events for a project
   */
  async getEvents(projectId: string, eventType?: string) {
    let query = this.supabase
      .from('events')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to get events: ${error.message}`);
    return data;
  }

  /**
   * Clear graph for a project (for re-expansion)
   */
  async clearGraph(projectId: string) {
    await Promise.all([
      this.supabase.from('graph_nodes').delete().eq('project_id', projectId),
      this.supabase.from('graph_edges').delete().eq('project_id', projectId),
    ]);
  }

  /**
   * Clear candidates for a project (for re-recombination)
   */
  async clearCandidates(projectId: string) {
    await this.supabase.from('candidates').delete().eq('project_id', projectId);
  }
}
