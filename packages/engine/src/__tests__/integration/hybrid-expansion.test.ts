import { HybridExpander, ExplorationMode, ToneModifier } from '../../index';
import { join } from 'path';

describe('HybridExpander Integration', () => {
  const lexiconPath = join(__dirname, '../../../../../../lexicon');
  let expander: HybridExpander;

  beforeAll(async () => {
    // Initialize without API key for deterministic-only testing
    expander = new HybridExpander(lexiconPath);
    await expander.initialize();
  });

  describe('Deterministic-only mode', () => {
    it('should expand phrase without LLM', async () => {
      const result = await expander.expand('cloud data', {
        maxDepth: 1,
        maxNodes: 50,
        enableLLM: false,
      });

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.edges.length).toBeGreaterThan(0);
      expect(result.metadata?.llmEnabled).toBe(false);
      expect(result.metadata?.llmEnrichedNodes).toBeUndefined();
    });

    it('should respect node and depth limits', async () => {
      const result = await expander.expand('cloud sync', {
        maxDepth: 1,
        maxNodes: 10,
        enableLLM: false,
      });

      expect(result.nodes.length).toBeLessThanOrEqual(10);
      expect(result.metadata?.totalNodes).toBeLessThanOrEqual(10);
    });

    it('should use all deterministic strategies', async () => {
      const result = await expander.expand('data store', {
        maxDepth: 2,
        maxNodes: 100,
        enableLLM: false,
      });

      expect(result.nodes.length).toBeGreaterThan(2);
      expect(result.edges.length).toBeGreaterThan(0);

      // Check that we have diverse edge types from different strategies
      const edgeTypes = new Set(result.edges.map((e) => e.type));
      expect(edgeTypes.size).toBeGreaterThan(1);
    });
  });

  describe('Hybrid mode (without API key)', () => {
    it('should fallback to deterministic when LLM is enabled but no API key', async () => {
      const result = await expander.expand('cloud data', {
        maxDepth: 1,
        maxNodes: 50,
        enableLLM: true,
        llmTopN: 10,
      });

      // Should still return results, but without LLM enrichment
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.metadata?.llmEnabled).toBe(false);
    });
  });

  describe('Cache operations', () => {
    it('should report cache stats', () => {
      const stats = expander.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('enabled');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.enabled).toBe('boolean');
    });

    it('should clear cache', () => {
      expander.clearCache();
      const stats = expander.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });
});

describe('HybridExpander with LLM (requires API key)', () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Skip these tests if no API key is provided
  const describeIfApiKey = apiKey ? describe : describe.skip;

  describeIfApiKey('LLM enrichment', () => {
    let expander: HybridExpander;

    beforeAll(async () => {
      expander = new HybridExpander(
        join(__dirname, '../../../../../../lexicon'),
        apiKey
      );
      await expander.initialize();
    });

    it('should enrich nodes with LLM', async () => {
      const result = await expander.expand('cloud sync', {
        maxDepth: 1,
        maxNodes: 50,
        enableLLM: true,
        llmTopN: 5,
        llmMode: ExplorationMode.EXPLORATORY,
        llmTone: ToneModifier.BRANDABLE,
      });

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.metadata?.llmEnabled).toBe(true);
      expect(result.metadata?.llmEnrichedNodes).toBeGreaterThan(0);
      expect(result.metadata?.confidenceScores).toBeDefined();
    }, 30000); // 30 second timeout for LLM calls

    it('should respect exploration mode', async () => {
      const safeResult = await expander.expand('data store', {
        maxDepth: 1,
        maxNodes: 30,
        enableLLM: true,
        llmTopN: 3,
        llmMode: ExplorationMode.SAFE,
      });

      expect(safeResult.metadata?.llmMode).toBe(ExplorationMode.SAFE);
    }, 30000);

    it('should apply different tone modifiers', async () => {
      const result = await expander.expand('sync hub', {
        maxDepth: 1,
        maxNodes: 30,
        enableLLM: true,
        llmTopN: 3,
        llmTone: ToneModifier.TECHNICAL,
      });

      expect(result.metadata?.llmTone).toBe(ToneModifier.TECHNICAL);
    }, 30000);
  });
});
