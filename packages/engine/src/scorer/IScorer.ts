import { DomainScore } from '@dotcomseekr/shared';

/**
 * Interface for domain quality scoring
 */
export interface IScorer {
  /**
   * Scores a domain name candidate
   */
  score(domainName: string): DomainScore;
}
