import { DeterministicExpander, ExpansionStrategy } from './DeterministicExpander';
import { LLMEnricher } from '../enricher/LLMEnricher';
import {
  ExplorationMode,
  ToneModifier,
  LLMEnrichmentOptions,
  DEFAULT_LLM_OPTIONS,
} from '../enricher/schemas';
import { ExpansionResult } from '../types';

export interface HybridExpansionOptions {
  // Deterministic options
  maxDepth: number;
  maxNodes: number;
  deterministicStrategies: ExpansionStrategy[];
  enablePrefixes: boolean;
  enableSuffixes: boolean;

  // LLM options
  enableLLM: boolean;
  llmTopN: number;
  llmMode: ExplorationMode;
  llmTone: ToneModifier;
  llmMaxTokens: number;
  llmTimeout: number;
}

export const DEFAULT_HYBRID_OPTIONS: HybridExpansionOptions = {
  maxDepth: 2,
  maxNodes: 500,
  deterministicStrategies: Object.values(ExpansionStrategy),
  enablePrefixes: true,
  enableSuffixes: true,
  enableLLM: false,
  llmTopN: 10,
  llmMode: ExplorationMode.EXPLORATORY,
  llmTone: ToneModifier.BRANDABLE,
  llmMaxTokens: 1000,
  llmTimeout: 10000,
};

interface ScoredNode {
  value: string;
  score: number;
}

/**
 * Hybrid expander that combines deterministic expansion with LLM enrichment
 */
export class HybridExpander {
  private deterministicExpander: DeterministicExpander;
  private llmEnricher: LLMEnricher | null = null;

  constructor(
    private lexiconPath: string,
    private anthropicApiKey?: string
  ) {
    this.deterministicExpander = new DeterministicExpander(lexiconPath);

    if (anthropicApiKey) {
      this.llmEnricher = new LLMEnricher(anthropicApiKey);
    }
  }

  /**
   * Initialize the expander
   */
  async initialize(): Promise<void> {
    await this.deterministicExpander.initialize();
  }

  /**
   * Expand phrase with hybrid approach
   */
  async expand(
    phrase: string,
    options: Partial<HybridExpansionOptions> = {}
  ): Promise<ExpansionResult> {
    const opts = { ...DEFAULT_HYBRID_OPTIONS, ...options };

    // Step 1: Deterministic expansion
    const deterministicResult = await this.deterministicExpander.expandWithOptions(phrase, {
      maxDepth: opts.maxDepth,
      maxNodes: opts.maxNodes,
      strategies: opts.deterministicStrategies,
      enablePrefixes: opts.enablePrefixes,
      enableSuffixes: opts.enableSuffixes,
    });

    // If LLM is disabled or not configured, return deterministic result
    if (!opts.enableLLM || !this.llmEnricher) {
      return {
        ...deterministicResult,
        metadata: {
          ...deterministicResult.metadata,
          llmEnabled: false,
        },
      };
    }

    // Step 2: Score deterministic nodes (simple frequency-based scoring)
    const scoredNodes = this.scoreNodes(deterministicResult.nodes);

    // Step 3: Select top N nodes for LLM enrichment
    const topNodes = scoredNodes.slice(0, opts.llmTopN);

    // Step 4: LLM enrichment
    const llmNodes: string[] = [];
    const llmEdges: Array<{ source: string; target: string; type: string }> = [];
    const confidenceScores = new Map<string, number>();

    const llmOptions: LLMEnrichmentOptions = {
      mode: opts.llmMode,
      tone: opts.llmTone,
      maxTokens: opts.llmMaxTokens,
      timeoutMs: opts.llmTimeout,
      topN: opts.llmTopN,
    };

    for (const node of topNodes) {
      try {
        const enrichment = await this.llmEnricher.enrichToken(
          node.value,
          phrase,
          llmOptions
        );

        // Add enriched tokens
        for (const token of enrichment.tokens) {
          if (!llmNodes.includes(token) && !deterministicResult.nodes.includes(token)) {
            llmNodes.push(token);
            confidenceScores.set(token, enrichment.confidence);

            // Create edge from source node to enriched token
            llmEdges.push({
              source: node.value,
              target: token,
              type: 'LLM_ENRICHED',
            });
          }
        }
      } catch (error: any) {
        console.error(`Failed to enrich node "${node.value}":`, error.message);
        // Continue with next node on failure
      }
    }

    // Step 5: Combine results
    return {
      nodes: [...deterministicResult.nodes, ...llmNodes],
      edges: [...deterministicResult.edges, ...llmEdges],
      metadata: {
        ...deterministicResult.metadata,
        llmEnabled: true,
        llmEnrichedNodes: llmNodes.length,
        llmTopN: topNodes.map((n) => n.value),
        llmMode: opts.llmMode,
        llmTone: opts.llmTone,
        confidenceScores: Object.fromEntries(confidenceScores),
      },
    };
  }

  /**
   * Score nodes based on simple frequency/connectivity heuristics
   * (In a real system, this would use graph centrality metrics)
   */
  private scoreNodes(nodes: string[]): ScoredNode[] {
    // Simple scoring: shorter words and more common patterns score higher
    return nodes
      .map((value) => ({
        value,
        score: this.calculateNodeScore(value),
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate score for a single node
   */
  private calculateNodeScore(value: string): number {
    let score = 100;

    // Prefer shorter tokens (more flexible for combinations)
    if (value.length > 12) score -= 20;
    else if (value.length < 6) score += 10;

    // Prefer tokens with good vowel/consonant balance
    const vowels = (value.match(/[aeiou]/gi) || []).length;
    const consonants = value.length - vowels;
    const ratio = vowels / value.length;

    if (ratio >= 0.3 && ratio <= 0.5) {
      score += 15; // Good pronounceability
    }

    // Prefer tokens without numbers
    if (/\d/.test(value)) {
      score -= 30;
    }

    return Math.max(0, score);
  }

  /**
   * Clear LLM cache
   */
  clearCache(): void {
    this.llmEnricher?.clearCache();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; enabled: boolean } {
    return {
      size: this.llmEnricher?.getCacheSize() || 0,
      enabled: !!this.llmEnricher,
    };
  }
}
