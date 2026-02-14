import { IExpander } from './IExpander';
import { ExpansionResult } from '../types';
import { LexiconLoader } from './LexiconLoader';
import { PhraseSplitter } from './PhraseSplitter';

export enum ExpansionStrategy {
  SYNONYM = 'SYNONYM',
  RELATED = 'RELATED',
  RHYME = 'RHYME',
  PHONETIC_NEIGHBOR = 'PHONETIC_NEIGHBOR',
  MORPHOLOGICAL = 'MORPHOLOGICAL',
  ALLITERATIVE = 'ALLITERATIVE',
}

export interface ExpansionOptions {
  maxDepth: number;
  maxNodes: number;
  strategies: ExpansionStrategy[];
  enablePrefixes: boolean;
  enableSuffixes: boolean;
}

interface GraphNode {
  id: string;
  value: string;
  depth: number;
  strategy: ExpansionStrategy | 'ROOT';
  parent?: string;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

/**
 * Deterministic phrase expander using local JSON lexicons
 */
export class DeterministicExpander implements IExpander {
  private lexicon: LexiconLoader;
  private splitter: PhraseSplitter;

  constructor(private lexiconPath: string) {
    this.lexicon = new LexiconLoader(lexiconPath);
    this.splitter = new PhraseSplitter();
  }

  /**
   * Initialize the expander by loading lexicons
   */
  async initialize(): Promise<void> {
    await this.lexicon.load();
    this.splitter.setStopwords(this.lexicon.getAllStopwords());
  }

  /**
   * Expand phrase using deterministic strategies
   */
  async expand(phrase: string, maxDepth: number): Promise<ExpansionResult> {
    const options: ExpansionOptions = {
      maxDepth,
      maxNodes: 1000,
      strategies: Object.values(ExpansionStrategy),
      enablePrefixes: true,
      enableSuffixes: true,
    };

    return this.expandWithOptions(phrase, options);
  }

  /**
   * Expand with custom options
   */
  async expandWithOptions(phrase: string, options: ExpansionOptions): Promise<ExpansionResult> {
    // Ensure lexicons are loaded
    await this.initialize();

    // Split phrase into root tokens
    const rootTokens = this.splitter.split(phrase, { removeStopwords: true });

    // Filter blocked words
    const validTokens = rootTokens.filter((token) => !this.lexicon.isBlocked(token));

    if (validTokens.length === 0) {
      return {
        nodes: [],
        edges: [],
        metadata: { error: 'No valid tokens after filtering' },
      };
    }

    // Build expansion graph
    const { nodes, edges } = this.buildExpansionGraph(validTokens, options);

    return {
      nodes: nodes.map((n) => n.value),
      edges: edges.map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type,
      })),
      metadata: {
        rootTokens: validTokens,
        totalNodes: nodes.length,
        totalEdges: edges.length,
        depth: options.maxDepth,
        strategies: options.strategies,
      },
    };
  }

  /**
   * Build expansion graph using BFS
   */
  private buildExpansionGraph(
    rootTokens: string[],
    options: ExpansionOptions
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const seen = new Set<string>();
    const queue: GraphNode[] = [];

    // Add root nodes
    for (const token of rootTokens) {
      const node: GraphNode = {
        id: token,
        value: token,
        depth: 0,
        strategy: 'ROOT',
      };
      nodes.push(node);
      seen.add(token);
      queue.push(node);
    }

    // BFS expansion
    while (queue.length > 0 && nodes.length < options.maxNodes) {
      const current = queue.shift()!;

      // Don't expand beyond max depth
      if (current.depth >= options.maxDepth) {
        continue;
      }

      // Expand using each strategy
      for (const strategy of options.strategies) {
        const expansions = this.expandNode(current.value, strategy, options);

        for (const expansion of expansions) {
          // Skip if already seen or blocked
          if (seen.has(expansion) || this.lexicon.isBlocked(expansion)) {
            continue;
          }

          // Add node
          const newNode: GraphNode = {
            id: expansion,
            value: expansion,
            depth: current.depth + 1,
            strategy,
            parent: current.id,
          };

          nodes.push(newNode);
          seen.add(expansion);

          // Add edge
          edges.push({
            source: current.id,
            target: expansion,
            type: strategy,
          });

          // Add to queue for further expansion
          if (newNode.depth < options.maxDepth) {
            queue.push(newNode);
          }

          // Stop if we hit max nodes
          if (nodes.length >= options.maxNodes) {
            break;
          }
        }

        if (nodes.length >= options.maxNodes) {
          break;
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Expand a single node using a specific strategy
   */
  private expandNode(word: string, strategy: ExpansionStrategy, options: ExpansionOptions): string[] {
    switch (strategy) {
      case ExpansionStrategy.SYNONYM:
        return this.lexicon.getSynonyms(word);

      case ExpansionStrategy.RELATED:
        return this.lexicon.getRelated(word);

      case ExpansionStrategy.RHYME:
        return this.lexicon.getRhymes(word);

      case ExpansionStrategy.PHONETIC_NEIGHBOR:
        return this.lexicon.getPhoneticNeighbors(word);

      case ExpansionStrategy.MORPHOLOGICAL:
        return this.expandMorphological(word, options);

      case ExpansionStrategy.ALLITERATIVE:
        return this.expandAlliterative(word);

      default:
        return [];
    }
  }

  /**
   * Expand using morphological variations (prefixes/suffixes)
   */
  private expandMorphological(word: string, options: ExpansionOptions): string[] {
    const variations: string[] = [];

    if (options.enablePrefixes) {
      const prefixes = this.lexicon.getPrefixes();
      for (const prefix of prefixes) {
        variations.push(prefix + word);
      }
    }

    if (options.enableSuffixes) {
      const suffixes = this.lexicon.getSuffixes();
      for (const suffix of suffixes) {
        variations.push(word + suffix);
      }
    }

    return variations;
  }

  /**
   * Expand using alliteration (same starting letter)
   */
  private expandAlliterative(word: string): string[] {
    if (word.length === 0) return [];

    const firstLetter = word[0].toLowerCase();
    const seeds = this.lexicon.getAlliterationSeeds(firstLetter);

    // Filter out the original word
    return seeds.filter((seed) => seed !== word);
  }
}
