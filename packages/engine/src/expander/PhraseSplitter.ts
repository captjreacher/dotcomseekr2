/**
 * Splits phrases into meaningful tokens
 */
export class PhraseSplitter {
  split(phrase: string): string[] {
    // TODO: Implement smart phrase splitting
    // - Handle multi-word terms
    // - Remove stopwords
    // - Normalize tokens
    return phrase.toLowerCase().split(/\s+/);
  }

  normalize(token: string): string {
    // TODO: Normalize tokens (lowercase, trim, etc.)
    return token.toLowerCase().trim();
  }
}
