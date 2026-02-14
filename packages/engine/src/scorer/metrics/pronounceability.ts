/**
 * Scores domain pronounceability (0-100)
 */
export function scorePronounceability(domain: string): number {
  let score = 100;

  // Vowel ratio (ideal: 40-50%)
  const vowelCount = (domain.match(/[aeiou]/g) || []).length;
  const vowelRatio = vowelCount / domain.length;

  if (vowelRatio < 0.2 || vowelRatio > 0.6) {
    score -= 20;
  } else if (vowelRatio >= 0.35 && vowelRatio <= 0.5) {
    score += 10; // Bonus for ideal ratio
  }

  // Consonant clusters (penalize 3+ consecutive consonants)
  const consonantClusters = domain.match(/[bcdfghjklmnpqrstvwxyz]{3,}/g) || [];
  score -= consonantClusters.length * 15;

  // Vowel clusters (penalize 3+ consecutive vowels)
  const vowelClusters = domain.match(/[aeiou]{3,}/g) || [];
  score -= vowelClusters.length * 10;

  // Syllable count estimation (ideal: 2-3 syllables)
  const syllables = estimateSyllables(domain);
  if (syllables >= 2 && syllables <= 3) {
    score += 10;
  } else if (syllables > 4) {
    score -= (syllables - 4) * 10;
  }

  // Common phoneme patterns (bonus)
  const goodPatterns = ['sh', 'ch', 'th', 'ph', 'ck', 'ng'];
  for (const pattern of goodPatterns) {
    if (domain.includes(pattern)) {
      score += 5;
    }
  }

  // Difficult consonant combinations (penalty)
  const badClusters = ['bq', 'fq', 'gq', 'jq', 'kq', 'pq', 'vq', 'wq', 'xq', 'zq'];
  for (const cluster of badClusters) {
    if (domain.includes(cluster)) {
      score -= 25;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Estimate syllable count (simple heuristic)
 */
function estimateSyllables(word: string): number {
  const vowelGroups = word.match(/[aeiou]+/g) || [];
  return Math.max(1, vowelGroups.length);
}
