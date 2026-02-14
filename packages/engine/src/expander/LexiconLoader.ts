import { readFile } from 'fs/promises';
import { join } from 'path';

export interface ToneGlue {
  prefixes: Record<string, string[]>;
  suffixes: Record<string, string[]>;
  modifiers: Record<string, string[]>;
  alliteration_seeds: Record<string, string[]>;
  phonetic_clusters: Record<string, string[]>;
  brandable_patterns: Record<string, string[]>;
}

export interface Stopwords {
  [category: string]: string[];
}

export interface Blocklist {
  [category: string]: string[];
}

/**
 * Loads and caches JSON lexicon files
 */
export class LexiconLoader {
  private synonyms: Record<string, string[]> = {};
  private related: Record<string, string[]> = {};
  private rhymes: Record<string, string[]> = {};
  private phonetics: Record<string, string[]> = {};
  private toneGlue: ToneGlue | null = null;
  private stopwords: Stopwords = {};
  private blocklist: Blocklist = {};
  private loaded = false;

  constructor(private lexiconPath: string) {}

  /**
   * Load all lexicon files
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      this.synonyms = await this.loadJSON<Record<string, string[]>>('base_synonyms.json');
      this.related = await this.loadJSON<Record<string, string[]>>('base_related.json');
      this.rhymes = await this.loadJSON<Record<string, string[]>>('base_rhymes.json');
      this.phonetics = await this.loadJSON<Record<string, string[]>>('base_phonetics.json');
      this.toneGlue = await this.loadJSON<ToneGlue>('tone_glue.json');
      this.stopwords = await this.loadJSON<Stopwords>('stopwords.json');
      this.blocklist = await this.loadJSON<Blocklist>('blocklist.json');
      this.loaded = true;
    } catch (error) {
      console.error('Error loading lexicon files:', error);
      throw new Error(`Failed to load lexicon files from ${this.lexiconPath}`);
    }
  }

  private async loadJSON<T>(filename: string): Promise<T> {
    const path = join(this.lexiconPath, filename);
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as T;
  }

  /**
   * Get synonyms for a word
   */
  getSynonyms(word: string): string[] {
    const normalized = word.toLowerCase();
    return this.synonyms[normalized] || [];
  }

  /**
   * Get related terms for a word
   */
  getRelated(word: string): string[] {
    const normalized = word.toLowerCase();
    return this.related[normalized] || [];
  }

  /**
   * Get rhymes for a word
   */
  getRhymes(word: string): string[] {
    const normalized = word.toLowerCase();
    return this.rhymes[normalized] || [];
  }

  /**
   * Get phonetic neighbors for a word
   */
  getPhoneticNeighbors(word: string): string[] {
    const normalized = word.toLowerCase();
    return this.phonetics[normalized] || [];
  }

  /**
   * Get all prefixes by category
   */
  getPrefixes(category?: string): string[] {
    if (!this.toneGlue) return [];
    if (category) {
      return this.toneGlue.prefixes[category] || [];
    }
    return Object.values(this.toneGlue.prefixes).flat();
  }

  /**
   * Get all suffixes by category
   */
  getSuffixes(category?: string): string[] {
    if (!this.toneGlue) return [];
    if (category) {
      return this.toneGlue.suffixes[category] || [];
    }
    return Object.values(this.toneGlue.suffixes).flat();
  }

  /**
   * Get alliteration seeds for a letter
   */
  getAlliterationSeeds(letter: string): string[] {
    if (!this.toneGlue) return [];
    const normalized = letter.toLowerCase();
    return this.toneGlue.alliteration_seeds[normalized] || [];
  }

  /**
   * Get phonetic cluster words
   */
  getPhoneticCluster(cluster: string): string[] {
    if (!this.toneGlue) return [];
    return this.toneGlue.phonetic_clusters[cluster] || [];
  }

  /**
   * Check if word is a stopword
   */
  isStopword(word: string): boolean {
    const normalized = word.toLowerCase();
    return Object.values(this.stopwords).some((list) => list.includes(normalized));
  }

  /**
   * Check if word is blocked
   */
  isBlocked(word: string): boolean {
    const normalized = word.toLowerCase();
    return Object.values(this.blocklist).some((list) => list.includes(normalized));
  }

  /**
   * Get all stopwords
   */
  getAllStopwords(): string[] {
    return Object.values(this.stopwords).flat();
  }

  /**
   * Get all blocked words
   */
  getAllBlockedWords(): string[] {
    return Object.values(this.blocklist).flat();
  }
}
