/**
 * Splits phrases into meaningful tokens
 */
export class PhraseSplitter {
  private stopwords: Set<string>;

  constructor(stopwords: string[] = []) {
    this.stopwords = new Set(stopwords.map((w) => w.toLowerCase()));
  }

  /**
   * Split phrase into tokens
   */
  split(phrase: string, options: { removeStopwords?: boolean } = {}): string[] {
    const { removeStopwords = true } = options;

    // Normalize and split
    const normalized = this.normalizePhrase(phrase);
    const tokens = this.tokenize(normalized);

    // Filter stopwords if requested
    const filtered = removeStopwords
      ? tokens.filter((token) => !this.stopwords.has(token))
      : tokens;

    // Remove duplicates while preserving order
    return [...new Set(filtered)];
  }

  /**
   * Normalize a phrase
   */
  private normalizePhrase(phrase: string): string {
    return phrase
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, ' ') // Replace non-alphanumeric except hyphen with space
      .replace(/\s+/g, ' '); // Collapse multiple spaces
  }

  /**
   * Tokenize normalized phrase
   */
  private tokenize(phrase: string): string[] {
    // Split on whitespace and hyphens
    const tokens = phrase.split(/[\s-]+/);

    // Filter out empty tokens and single characters (unless they're valid)
    return tokens.filter((token) => token.length > 0 && this.isValidToken(token));
  }

  /**
   * Check if token is valid
   */
  private isValidToken(token: string): boolean {
    // Allow single-char tokens only if they're letters
    if (token.length === 1) {
      return /[a-z]/.test(token);
    }

    // Token must contain at least one letter
    return /[a-z]/.test(token);
  }

  /**
   * Normalize a single token
   */
  normalize(token: string): string {
    return token.toLowerCase().trim().replace(/[^\w]/g, '');
  }

  /**
   * Extract camelCase or PascalCase words
   */
  splitCamelCase(word: string): string[] {
    // Split on capital letters
    const parts = word.replace(/([A-Z])/g, ' $1').trim().split(/\s+/);
    return parts.map((p) => p.toLowerCase());
  }

  /**
   * Update stopwords list
   */
  setStopwords(stopwords: string[]): void {
    this.stopwords = new Set(stopwords.map((w) => w.toLowerCase()));
  }
}
