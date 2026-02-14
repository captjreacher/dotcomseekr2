import { ScoringWeights } from '@dotcomseekr/shared';

/**
 * Default scoring weights
 */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  pronounceability: 0.25,
  brandability: 0.35,
  semanticFit: 0.25,
  technicalQuality: 0.15,
};

export function applyWeights(scores: Record<string, number>, weights: ScoringWeights): number {
  const total =
    scores.pronounceability * weights.pronounceability +
    scores.brandability * weights.brandability +
    scores.semanticFit * weights.semanticFit +
    scores.technicalQuality * weights.technicalQuality;

  return Math.max(0, Math.min(100, total));
}
