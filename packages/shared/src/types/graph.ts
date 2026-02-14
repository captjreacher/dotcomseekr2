export type NodeType = 'phrase' | 'word' | 'synonym' | 'related' | 'enriched';

export type EdgeType = 'synonym' | 'antonym' | 'related' | 'derived' | 'enriched';

export type SourceSystem = 'lexicon' | 'llm' | 'user';

export interface GraphNode {
  id: string;
  projectId: string;
  nodeType: NodeType;
  value: string;
  normalizedValue: string;
  semanticCategory?: string;
  semanticWeight: number;
  llmEnrichment?: LLMEnrichment;
  depthLevel: number;
  isTerminal: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface GraphEdge {
  id: string;
  projectId: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: EdgeType;
  weight: number;
  sourceSystem: SourceSystem;
  sourceConfidence: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface LLMEnrichment {
  alternatives: string[];
  context: string;
  sentiment?: string;
}
