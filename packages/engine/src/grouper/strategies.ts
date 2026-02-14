/**
 * Grouping strategy types
 */
export type GroupingStrategy = 'by-theme' | 'by-strategy' | 'by-score-tier';

export const SCORE_TIERS = {
  EXCELLENT: { min: 80, max: 100, label: 'Excellent' },
  GOOD: { min: 60, max: 79, label: 'Good' },
  FAIR: { min: 40, max: 59, label: 'Fair' },
  POOR: { min: 0, max: 39, label: 'Needs Work' },
};
