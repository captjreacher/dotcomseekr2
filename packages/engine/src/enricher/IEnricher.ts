/**
 * Interface for LLM-based semantic enrichment
 */
export interface IEnricher {
  /**
   * Enriches expansion results with LLM-generated alternatives
   */
  enrich(words: string[], context: string): Promise<EnrichmentResult>;
}

export interface EnrichmentResult {
  alternatives: Map<string, string[]>;
  semanticCategories: Map<string, string>;
  weights: Map<string, number>;
}
