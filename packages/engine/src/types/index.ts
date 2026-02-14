// Engine-specific types
export interface EngineConfig {
  maxDepth: number;
  enableLLM: boolean;
  lexiconPath: string;
}

export interface ExpansionResult {
  nodes: string[];
  edges: Array<{ source: string; target: string; type: string }>;
  metadata: Record<string, unknown>;
}
