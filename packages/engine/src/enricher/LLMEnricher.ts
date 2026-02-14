import { IEnricher, EnrichmentResult } from './IEnricher';

/**
 * LLM-based semantic enrichment using Claude API
 */
export class LLMEnricher implements IEnricher {
  constructor(private apiKey: string) {}

  async enrich(words: string[], context: string): Promise<EnrichmentResult> {
    // TODO: Call Claude API for semantic enrichment
    // - Generate alternatives
    // - Categorize terms
    // - Assign semantic weights
    return {
      alternatives: new Map(),
      semanticCategories: new Map(),
      weights: new Map(),
    };
  }
}
