import { readFile } from 'fs/promises';
import { join } from 'path';
import { PortableLexicon } from '../generation/lexicon';
import type { LexiconData, ToneGlue } from '../generation/types';

export type { ToneGlue };

export type Stopwords = Record<string, string[]>;
export type Blocklist = Record<string, string[]>;

/**
 * Node loader for the on-disk JSON lexicons.
 *
 * The actual lookups are delegated to `PortableLexicon` so the Node and
 * Deno/Edge runtimes share a single implementation.
 */
export class LexiconLoader {
  private portable: PortableLexicon | null = null;

  constructor(private lexiconPath: string) {}

  /**
   * Load all lexicon files
   */
  async load(): Promise<void> {
    if (this.portable) return;

    try {
      const data: LexiconData = {
        synonyms: await this.loadJSON<Record<string, string[]>>('base_synonyms.json'),
        related: await this.loadJSON<Record<string, string[]>>('base_related.json'),
        rhymes: await this.loadJSON<Record<string, string[]>>('base_rhymes.json'),
        phonetics: await this.loadJSON<Record<string, string[]>>('base_phonetics.json'),
        toneGlue: await this.loadJSON<ToneGlue>('tone_glue.json'),
        stopwords: await this.loadJSON<Stopwords>('stopwords.json'),
        blocklist: await this.loadJSON<Blocklist>('blocklist.json'),
      };

      this.portable = new PortableLexicon(data);
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

  getSynonyms(word: string): string[] {
    return this.portable?.getSynonyms(word) ?? [];
  }

  getRelated(word: string): string[] {
    return this.portable?.getRelated(word) ?? [];
  }

  getRhymes(word: string): string[] {
    return this.portable?.getRhymes(word) ?? [];
  }

  getPhoneticNeighbors(word: string): string[] {
    return this.portable?.getPhoneticNeighbors(word) ?? [];
  }

  getPrefixes(category?: string): string[] {
    return this.portable?.getPrefixes(category) ?? [];
  }

  getSuffixes(category?: string): string[] {
    return this.portable?.getSuffixes(category) ?? [];
  }

  getAlliterationSeeds(letter: string): string[] {
    return this.portable?.getAlliterationSeeds(letter) ?? [];
  }

  getPhoneticCluster(cluster: string): string[] {
    return this.portable?.getPhoneticCluster(cluster) ?? [];
  }

  isStopword(word: string): boolean {
    return this.portable?.isStopword(word) ?? false;
  }

  isBlocked(word: string): boolean {
    return this.portable?.isBlocked(word) ?? false;
  }

  getAllStopwords(): string[] {
    return this.portable?.getAllStopwords() ?? [];
  }

  getAllBlockedWords(): string[] {
    return this.portable?.getAllBlockedWords() ?? [];
  }
}
