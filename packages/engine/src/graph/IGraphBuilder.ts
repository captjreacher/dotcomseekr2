import { GraphNode, GraphEdge } from '@dotcomseekr/shared';

/**
 * Interface for graph construction
 */
export interface IGraphBuilder {
  /**
   * Builds a graph from expansion results
   */
  buildGraph(nodes: string[], edges: Array<{ source: string; target: string; type: string }>): Graph;
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
}
