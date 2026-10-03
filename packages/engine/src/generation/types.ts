import type { DomainScore } from '@dotcomseekr/shared';

export type { DomainScore };

/**
 * Canonical deterministic expansion strategies.
 *
 * This enum is the single source of truth for the six strategies and is safe to
 * consume from any runtime (Node, Deno/Edge, browser) because it has no
 * platform-specific imports.
 */
export enum ExpansionStrategy {
  SYNONYM = 'SYNONYM',
  RELATED = 'RELATED',
  RHYME = 'RHYME',
  PHONETIC_NEIGHBOR = 'PHONETIC_NEIGHBOR',
  MORPHOLOGICAL = 'MORPHOLOGICAL',
  ALLITERATIVE = 'ALLITERATIVE',
}

/**
 * Strategy labels surfaced to the UI. `exact` is the seed itself; the remaining
 * keys mirror the six deterministic expansion strategies.
 */
export const GENERATION_STRATEGIES = [
  'exact',
  ExpansionStrategy.SYNONYM,
  ExpansionStrategy.RELATED,
  ExpansionStrategy.RHYME,
  ExpansionStrategy.PHONETIC_NEIGHBOR,
  ExpansionStrategy.MORPHOLOGICAL,
  ExpansionStrategy.ALLITERATIVE,
] as const;

export type GenerationStrategy =
  | 'exact'
  | ExpansionStrategy;

export const STRATEGY_LABELS: Record<GenerationStrategy, string> = {
  exact: 'Exact match',
  [ExpansionStrategy.SYNONYM]: 'Synonym ideas',
  [ExpansionStrategy.RELATED]: 'Related-word ideas',
  [ExpansionStrategy.RHYME]: 'Rhyme ideas',
  [ExpansionStrategy.PHONETIC_NEIGHBOR]: 'Phonetic neighbours',
  [ExpansionStrategy.MORPHOLOGICAL]: 'Morphological ideas',
  [ExpansionStrategy.ALLITERATIVE]: 'Alliterative ideas',
};

export interface ToneGlue {
  prefixes: Record<string, string[]>;
  suffixes: Record<string, string[]>;
  connectors?: Record<string, string[]>;
  modifiers: Record<string, string[]>;
  alliteration_seeds: Record<string, string[]>;
  phonetic_clusters: Record<string, string[]>;
  brandable_patterns: Record<string, string[]>;
}

/**
 * Fully materialised lexicon content. Producing this object is the only job of
 * the platform-specific loaders; every lookup below is pure and portable.
 */
export interface LexiconData {
  synonyms: Record<string, string[]>;
  related: Record<string, string[]>;
  rhymes: Record<string, string[]>;
  phonetics: Record<string, string[]>;
  toneGlue: ToneGlue;
  stopwords: Record<string, string[]>;
  blocklist: Record<string, string[]>;
}

export interface GenerateDomainCandidatesOptions {
  seed: string;
  tone?: string;
  useCase?: string;
  maxCandidates?: number;
}

export interface CandidateProvenance {
  seed: string;
  strategy: GenerationStrategy;
  sourceTerm: string;
  rootTokens: string[];
  expansionDepth: number;
  tone?: string;
  useCase?: string;
}

export interface GenerationCandidate {
  /** Domain-safe label (no TLD). */
  label: string;
  strategy: GenerationStrategy;
  strategyLabel: string;
  sourceTerm: string;
  rationale: string;
  score: DomainScore;
  scoreComponents: DomainScore;
  provenance: CandidateProvenance;
}
