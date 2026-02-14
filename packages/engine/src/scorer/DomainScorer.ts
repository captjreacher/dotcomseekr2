import { IScorer } from './IScorer';
import { DomainScore } from '@dotcomseekr/shared';

/**
 * Aggregates scores from multiple metrics
 */
export class DomainScorer implements IScorer {
  score(domainName: string): DomainScore {
    // TODO: Aggregate scores from all metrics
    // - Pronounceability
    // - Brandability
    // - Semantic fit
    // - Technical quality
    return {
      total: 0,
      pronounceability: 0,
      brandability: 0,
      semanticFit: 0,
      technicalQuality: 0,
    };
  }
}
