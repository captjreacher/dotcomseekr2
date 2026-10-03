import { ExpansionStrategy, GENERATION_STRATEGIES, type GenerationStrategy } from './types.ts';
import { PortableLexicon } from './lexicon.ts';

export interface ExpandedTerm {
  value: string;
  strategy: GenerationStrategy;
  sourceTerm: string;
}

export interface ExpandTermsOptions {
  enablePrefixes?: boolean;
  enableSuffixes?: boolean;
}

/** Normalise any incoming term into a domain-safe lowercase label fragment. */
export function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 48);
}

/**
 * Expand the root tokens through the six deterministic strategies.
 *
 * The result is ordered by strategy (see `GENERATION_STRATEGIES`) and then by
 * root token, which keeps generation deterministic for a given input.
 */
export function expandTerms(
  rootTokens: string[],
  lexicon: PortableLexicon,
  options: ExpandTermsOptions = {}
): ExpandedTerm[] {
  const { enablePrefixes = true, enableSuffixes = true } = options;
  const terms: ExpandedTerm[] = [];
  const seen = new Set<string>();

  const push = (raw: string, strategy: GenerationStrategy, sourceTerm: string) => {
    const value = normalizeLabel(raw);
    if (!value || value.length < 3 || seen.has(value)) return;
    if (lexicon.isBlocked(value)) return;
    seen.add(value);
    terms.push({ value, strategy, sourceTerm });
  };

  for (const strategy of GENERATION_STRATEGIES) {
    for (const token of rootTokens) {
      const normalizedToken = normalizeLabel(token);
      if (!normalizedToken) continue;

      switch (strategy) {
        case 'exact':
          push(normalizedToken, 'exact', token);
          break;
        case ExpansionStrategy.SYNONYM:
          for (const term of lexicon.getSynonyms(token)) push(term, strategy, token);
          break;
        case ExpansionStrategy.RELATED:
          for (const term of lexicon.getRelated(token)) push(term, strategy, token);
          break;
        case ExpansionStrategy.RHYME:
          for (const term of lexicon.getRhymes(token)) push(term, strategy, token);
          break;
        case ExpansionStrategy.PHONETIC_NEIGHBOR:
          for (const term of lexicon.getPhoneticNeighbors(token)) push(term, strategy, token);
          break;
        case ExpansionStrategy.MORPHOLOGICAL:
          if (enablePrefixes) {
            for (const prefix of lexicon.getPrefixes()) push(`${prefix}${normalizedToken}`, strategy, token);
          }
          if (enableSuffixes) {
            for (const suffix of lexicon.getSuffixes()) push(`${normalizedToken}${suffix}`, strategy, token);
          }
          break;
        case ExpansionStrategy.ALLITERATIVE:
          for (const seed of lexicon.getAlliterationSeeds(normalizedToken[0])) {
            if (normalizeLabel(seed) !== normalizedToken) push(seed, strategy, token);
          }
          break;
      }
    }
  }

  return terms;
}
