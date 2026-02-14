/**
 * Interface for domain name recombination
 */
export interface IRecombiner {
  /**
   * Generates domain name candidates from graph nodes
   */
  recombine(nodeIds: string[]): string[];
}
