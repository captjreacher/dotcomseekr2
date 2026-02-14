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
  // TODO: Apply weights to calculate total score
  return 0;
}
