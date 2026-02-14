/**
 * Linear word combination strategy (word1 + word2)
 */
export class LinearRecombination {
  /**
   * Generate linear combinations of words
   * Example: ["cloud", "sync"] => ["cloudsync", "synccloud"]
   */
  combine(words: string[]): string[] {
    const combinations: string[] = [];

    // Pairwise combinations
    for (let i = 0; i < words.length; i++) {
      for (let j = 0; j < words.length; j++) {
        if (i === j) continue;

        const combo = words[i] + words[j];
        combinations.push(combo);
      }
    }

    // Triple combinations (for smaller word sets)
    if (words.length <= 10) {
      for (let i = 0; i < words.length; i++) {
        for (let j = 0; j < words.length; j++) {
          for (let k = 0; k < words.length; k++) {
            if (i === j || j === k || i === k) continue;

            const combo = words[i] + words[j] + words[k];
            // Only add if reasonable length
            if (combo.length <= 20) {
              combinations.push(combo);
            }
          }
        }
      }
    }

    return combinations;
  }

  /**
   * Combine with custom separator
   */
  combineWithSeparator(words: string[], separator: string): string[] {
    const combinations: string[] = [];

    for (let i = 0; i < words.length; i++) {
      for (let j = 0; j < words.length; j++) {
        if (i === j) continue;

        const combo = words[i] + separator + words[j];
        combinations.push(combo);
      }
    }

    return combinations;
  }
}
