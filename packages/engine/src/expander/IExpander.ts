import { ExpansionResult } from '../types';

/**
 * Interface for deterministic phrase expansion
 */
export interface IExpander {
  /**
   * Expands a phrase into word sets using lexicon data
   */
  expand(phrase: string, maxDepth: number): Promise<ExpansionResult>;
}
