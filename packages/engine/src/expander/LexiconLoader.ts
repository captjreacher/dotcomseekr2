/**
 * Loads and caches JSON lexicon files
 */
export class LexiconLoader {
  private cache: Map<string, Record<string, string[]>> = new Map();

  constructor(private lexiconPath: string) {}

  async loadSynonyms(): Promise<Record<string, string[]>> {
    // TODO: Load synonyms.json
    return {};
  }

  async loadRelated(): Promise<Record<string, string[]>> {
    // TODO: Load related.json
    return {};
  }

  async loadTechTerms(): Promise<Record<string, string[]>> {
    // TODO: Load tech-terms.json
    return {};
  }

  getSynonyms(word: string): string[] {
    // TODO: Get synonyms for a word
    return [];
  }

  getRelated(word: string): string[] {
    // TODO: Get related terms for a word
    return [];
  }
}
