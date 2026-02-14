import { IRecombiner } from './IRecombiner';
import { LinearRecombination } from './strategies/LinearRecombination';
import { isValidDomainName, isPronounceab } from './rules';

export interface RecombinationOptions {
  maxLength: number;
  minLength: number;
  maxCandidates: number;
  allowHyphens: boolean;
  allowNumbers: boolean;
}

/**
 * Main recombination engine for generating domain names
 */
export class Recombiner implements IRecombiner {
  private linearStrategy: LinearRecombination;

  constructor() {
    this.linearStrategy = new LinearRecombination();
  }

  /**
   * Recombine node values into domain candidates
   */
  recombine(nodeValues: string[]): string[] {
    const options: RecombinationOptions = {
      maxLength: 20,
      minLength: 3,
      maxCandidates: 500,
      allowHyphens: false,
      allowNumbers: false,
    };

    return this.recombineWithOptions(nodeValues, options);
  }

  /**
   * Recombine with custom options
   */
  recombineWithOptions(nodeValues: string[], options: RecombinationOptions): string[] {
    const candidates = new Set<string>();

    // Strategy 1: Single words
    for (const node of nodeValues) {
      if (this.isValidCandidate(node, options)) {
        candidates.add(node);
      }
    }

    // Strategy 2: Linear combinations (2 words)
    const linearCombos = this.linearStrategy.combine(nodeValues);
    for (const combo of linearCombos) {
      if (this.isValidCandidate(combo, options)) {
        candidates.add(combo);
      }
    }

    // Strategy 3: Compound words with glue (optional hyphens)
    if (options.allowHyphens) {
      const hyphenated = this.createHyphenatedCombos(nodeValues);
      for (const combo of hyphenated) {
        if (this.isValidCandidate(combo, options)) {
          candidates.add(combo);
        }
      }
    }

    // Apply final filtering and pruning
    const filtered = this.filterByRules(Array.from(candidates), options);

    // Limit to max candidates
    return filtered.slice(0, options.maxCandidates);
  }

  /**
   * Check if candidate meets basic criteria
   */
  private isValidCandidate(candidate: string, options: RecombinationOptions): boolean {
    // Length check
    if (candidate.length < options.minLength || candidate.length > options.maxLength) {
      return false;
    }

    // Domain name validity
    if (!isValidDomainName(candidate)) {
      return false;
    }

    // Number check
    if (!options.allowNumbers && /\d/.test(candidate)) {
      return false;
    }

    // Hyphen check
    if (!options.allowHyphens && candidate.includes('-')) {
      return false;
    }

    return true;
  }

  /**
   * Create hyphenated combinations
   */
  private createHyphenatedCombos(words: string[]): string[] {
    const combos: string[] = [];

    for (let i = 0; i < words.length - 1; i++) {
      for (let j = i + 1; j < words.length; j++) {
        combos.push(`${words[i]}-${words[j]}`);
        combos.push(`${words[j]}-${words[i]}`);
      }
    }

    return combos;
  }

  /**
   * Filter candidates by domain formation rules
   */
  private filterByRules(candidates: string[], options: RecombinationOptions): string[] {
    return candidates.filter((candidate) => {
      // Must be valid domain name
      if (!isValidDomainName(candidate)) {
        return false;
      }

      // Check pronounceability
      if (!isPronounceab(candidate)) {
        return false;
      }

      // No consecutive hyphens
      if (candidate.includes('--')) {
        return false;
      }

      // No more than 2 hyphens total
      const hyphenCount = (candidate.match(/-/g) || []).length;
      if (hyphenCount > 2) {
        return false;
      }

      // Must have at least one vowel (for pronounceability)
      if (!/[aeiou]/.test(candidate)) {
        return false;
      }

      // No more than 4 consecutive consonants
      if (/[bcdfghjklmnpqrstvwxyz]{5,}/.test(candidate)) {
        return false;
      }

      return true;
    });
  }
}
