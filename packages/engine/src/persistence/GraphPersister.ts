import { GraphNode, GraphEdge, NodeType, EdgeType, SourceSystem } from '@dotcomseekr/shared';

export interface GraphSupabaseClient {
  from(table: string): {
    insert(data: unknown): Promise<{ data: unknown; error: Error | null }>;
    select(columns?: string): {
      eq(column: string, value: unknown): Promise<{ data: unknown; error: Error | null }>;
    };
  };
}

/**
 * Persists graph nodes and edges to database
 */
export class GraphPersister {
  constructor(private supabase: GraphSupabaseClient) {}

  /**
   * Batch insert nodes to database
   */
  async saveNodes(nodes: GraphNode[]): Promise<void> {
    if (nodes.length === 0) return;

    const BATCH_SIZE = 100;
    const batches = this.chunk(nodes, BATCH_SIZE);

    for (const batch of batches) {
      const { error } = await this.supabase.from('graph_nodes').insert(
        batch.map((node) => ({
          id: node.id,
          project_id: node.projectId,
          node_type: node.nodeType,
          value: node.value,
          normalized_value: node.normalizedValue,
          semantic_category: node.semanticCategory,
          semantic_weight: node.semanticWeight,
          llm_enrichment: node.llmEnrichment,
          depth_level: node.depthLevel,
          is_terminal: node.isTerminal,
          metadata: node.metadata,
          created_at: node.createdAt,
        }))
      );

      if (error) {
        throw new Error(`Failed to save nodes: ${error.message}`);
      }
    }
  }

  /**
   * Batch insert edges to database
   */
  async saveEdges(edges: GraphEdge[]): Promise<void> {
    if (edges.length === 0) return;

    const BATCH_SIZE = 100;
    const batches = this.chunk(edges, BATCH_SIZE);

    for (const batch of batches) {
      const { error } = await this.supabase.from('graph_edges').insert(
        batch.map((edge) => ({
          id: edge.id,
          project_id: edge.projectId,
          source_node_id: edge.sourceNodeId,
          target_node_id: edge.targetNodeId,
          edge_type: edge.edgeType,
          weight: edge.weight,
          source_system: edge.sourceSystem,
          source_confidence: edge.sourceConfidence,
          metadata: edge.metadata,
          created_at: edge.createdAt,
        }))
      );

      if (error) {
        throw new Error(`Failed to save edges: ${error.message}`);
      }
    }
  }

  /**
   * Load graph from database
   */
  async loadGraph(projectId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const { data: nodesData, error: nodesError } = await this.supabase
      .from('graph_nodes')
      .select('*')
      .eq('project_id', projectId);

    if (nodesError) {
      throw new Error(`Failed to load nodes: ${nodesError.message}`);
    }

    const { data: edgesData, error: edgesError } = await this.supabase
      .from('graph_edges')
      .select('*')
      .eq('project_id', projectId);

    if (edgesError) {
      throw new Error(`Failed to load edges: ${edgesError.message}`);
    }

    const nodes = (nodesData as any[]).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      nodeType: row.node_type as NodeType,
      value: row.value,
      normalizedValue: row.normalized_value,
      semanticCategory: row.semantic_category,
      semanticWeight: row.semantic_weight,
      llmEnrichment: row.llm_enrichment,
      depthLevel: row.depth_level,
      isTerminal: row.is_terminal,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
    }));

    const edges = (edgesData as any[]).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id,
      edgeType: row.edge_type as EdgeType,
      weight: row.weight,
      sourceSystem: row.source_system as SourceSystem,
      sourceConfidence: row.source_confidence,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
    }));

    return { nodes, edges };
  }

  /**
   * Helper: chunk array into batches
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
