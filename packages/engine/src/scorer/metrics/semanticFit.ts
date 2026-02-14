/**
 * Scores how well domain matches original intent (0-100)
 */
export function scoreSemanticFit(domain: string, originalPhrase: string): number {
  if (!originalPhrase) {
    return 50; // Neutral score if no original phrase
  }

  let score = 0;

  const normalizedDomain = domain.toLowerCase();
  const normalizedPhrase = originalPhrase.toLowerCase();
  const phraseWords = normalizedPhrase.split(/\s+/);

  // Direct substring match (strong signal)
  for (const word of phraseWords) {
    if (normalizedDomain.includes(word)) {
      score += 30;
    }
  }

  // Partial character overlap
  const overlapRatio = calculateOverlap(normalizedDomain, normalizedPhrase);
  score += overlapRatio * 40;

  // Same starting letter
  if (normalizedDomain[0] === normalizedPhrase[0]) {
    score += 10;
  }

  // Similar length (normalized)
  const lengthRatio = Math.min(normalizedDomain.length, normalizedPhrase.length) /
                      Math.max(normalizedDomain.length, normalizedPhrase.length);
  score += lengthRatio * 20;

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate character overlap between two strings
 */
function calculateOverlap(str1: string, str2: string): number {
  const chars1 = new Set(str1);
  const chars2 = new Set(str2);

  let overlap = 0;
  for (const char of chars1) {
    if (chars2.has(char)) {
      overlap++;
    }
  }

  const uniqueChars = new Set([...chars1, ...chars2]).size;
  return overlap / uniqueChars;
}
