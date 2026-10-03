import type { LexiconData } from './types.ts';

/**
 * Pure, platform-agnostic lexicon accessor.
 *
 * `LexiconLoader` (Node) and the embedded Edge lexicon data both construct this
 * class, so lexicon lookups have exactly one implementation across runtimes.
 */
export class PortableLexicon {
  constructor(private readonly data: LexiconData) {}

  getSynonyms(word: string): string[] {
    return this.data.synonyms[word.toLowerCase()] ?? [];
  }

  getRelated(word: string): string[] {
    return this.data.related[word.toLowerCase()] ?? [];
  }

  getRhymes(word: string): string[] {
    return this.data.rhymes[word.toLowerCase()] ?? [];
  }

  getPhoneticNeighbors(word: string): string[] {
    return this.data.phonetics[word.toLowerCase()] ?? [];
  }

  getPrefixes(category?: string): string[] {
    const prefixes = this.data.toneGlue?.prefixes ?? {};
    if (category) return prefixes[category] ?? [];
    return Object.values(prefixes).flat();
  }

  getSuffixes(category?: string): string[] {
    const suffixes = this.data.toneGlue?.suffixes ?? {};
    if (category) return suffixes[category] ?? [];
    return Object.values(suffixes).flat();
  }

  getAlliterationSeeds(letter: string): string[] {
    return this.data.toneGlue?.alliteration_seeds?.[letter.toLowerCase()] ?? [];
  }

  getPhoneticCluster(cluster: string): string[] {
    return this.data.toneGlue?.phonetic_clusters?.[cluster] ?? [];
  }

  isStopword(word: string): boolean {
    const normalized = word.toLowerCase();
    return Object.values(this.data.stopwords).some((list) => list.includes(normalized));
  }

  isBlocked(word: string): boolean {
    const normalized = word.toLowerCase();
    return Object.values(this.data.blocklist).some((list) => list.includes(normalized));
  }

  getAllStopwords(): string[] {
    return Object.values(this.data.stopwords).flat();
  }

  getAllBlockedWords(): string[] {
    return Object.values(this.data.blocklist).flat();
  }
}
