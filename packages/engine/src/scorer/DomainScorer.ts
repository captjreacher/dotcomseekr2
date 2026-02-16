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
    return this.scoreWithConfidence(domainName, originalPhrase, undefined);
  }

  /**
   * Score a domain name with optional confidence weighting
   * Confidence is a small modifier (max ±5 points) based on LLM confidence
   */
  scoreWithConfidence(
    domainName: string,
    originalPhrase?: string,
    confidenceMap?: Map<string, number>
  ): DomainScore {
    const pronounceability = scorePronounceability(domainName);
    const brandability = scoreBrandability(domainName);
    const semanticFit = scoreSemanticFit(domainName, originalPhrase || '');
    const technicalQuality = scoreTechnicalQuality(domainName);

    let total = applyWeights(
      {
        pronounceability,
        brandability,
        semanticFit,
        technicalQuality,
      },
      DEFAULT_WEIGHTS
    );

    // Apply confidence modifier (small adjustment, max ±5 points)
    if (confidenceMap) {
      const modifier = this.calculateConfidenceModifier(domainName, confidenceMap);
      total = Math.max(0, Math.min(100, total + modifier));
    }

    return {
      total: Math.round(total * 100) / 100,
      pronounceability: Math.round(pronounceability * 100) / 100,
      brandability: Math.round(brandability * 100) / 100,
      semanticFit: Math.round(semanticFit * 100) / 100,
      technicalQuality: Math.round(technicalQuality * 100) / 100,
    };
  }

  /**
   * Calculate confidence modifier from LLM confidence scores
   * Returns a value between -5 and +5
   */
  private calculateConfidenceModifier(
    domainName: string,
    confidenceMap: Map<string, number>
  ): number {
    // Extract tokens from domain name
    const tokens = domainName.toLowerCase().split(/[-_]/);

    // Find tokens that have confidence scores
    const confidences: number[] = [];
    for (const token of tokens) {
      if (confidenceMap.has(token)) {
        confidences.push(confidenceMap.get(token)!);
      }
    }

    if (confidences.length === 0) {
      return 0; // No confidence data, no modifier
    }

    // Average confidence across tokens
    const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;

    // Map confidence (0-1) to modifier (-5 to +5)
    // 0.5 confidence = 0 modifier (neutral)
    // 1.0 confidence = +5 modifier
    // 0.0 confidence = -5 modifier
    return (avgConfidence - 0.5) * 10;
  }
}

