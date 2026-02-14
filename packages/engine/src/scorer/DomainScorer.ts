import { IScorer } from './IScorer';
import { DomainScore } from '@dotcomseekr/shared';
import { scorePronounceability } from './metrics/pronounceability';
import { scoreBrandability } from './metrics/brandability';
import { scoreSemanticFit } from './metrics/semanticFit';
import { scoreTechnicalQuality } from './metrics/technicalQuality';
import { DEFAULT_WEIGHTS, applyWeights } from './weights';

/**
 * Aggregates scores from multiple metrics
 */
export class DomainScorer implements IScorer {
  /**
   * Score a domain name across all metrics
   */
  score(domainName: string, originalPhrase?: string): DomainScore {
    const pronounceability = scorePronounceability(domainName);
    const brandability = scoreBrandability(domainName);
    const semanticFit = scoreSemanticFit(domainName, originalPhrase || '');
    const technicalQuality = scoreTechnicalQuality(domainName);

    const total = applyWeights(
      {
        pronounceability,
        brandability,
        semanticFit,
        technicalQuality,
      },
      DEFAULT_WEIGHTS
    );

    return {
      total: Math.round(total * 100) / 100,
      pronounceability: Math.round(pronounceability * 100) / 100,
      brandability: Math.round(brandability * 100) / 100,
      semanticFit: Math.round(semanticFit * 100) / 100,
      technicalQuality: Math.round(technicalQuality * 100) / 100,
    };
  }
}
