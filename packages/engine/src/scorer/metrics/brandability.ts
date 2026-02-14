/**
 * Scores domain brandability (0-100)
 */
export function scoreBrandability(domain: string): number {
  let score = 50; // Start at middle

  // Length (ideal: 6-12 characters)
  const length = domain.length;
  if (length >= 6 && length <= 12) {
    score += 20;
  } else if (length <= 5) {
    score += 30; // Short is very brandable!
  } else if (length > 15) {
    score -= (length - 15) * 3;
  }

  // Uniqueness (made-up words score higher)
  if (isLikelyMadeUp(domain)) {
    score += 15;
  }

  // Has repeating patterns (memorable)
  if (hasRepeatingPattern(domain)) {
    score += 10;
  }

  // Starts with strong letter (B, C, D, F, G, K, P, S, T, Z)
  const strongStarts = ['b', 'c', 'd', 'f', 'g', 'k', 'p', 's', 't', 'z'];
  if (strongStarts.includes(domain[0])) {
    score += 5;
  }

  // Ends with strong sound (y, o, er, ly, ify)
  const strongEndings = ['y', 'o', 'er', 'ly', 'ify', 'hub', 'lab', 'kit'];
  for (const ending of strongEndings) {
    if (domain.endsWith(ending)) {
      score += 5;
      break;
    }
  }

  // Has alliteration
  if (hasAlliteration(domain)) {
    score += 10;
  }

  // Contains numbers (penalty for brandability)
  if (/\d/.test(domain)) {
    score -= 20;
  }

  // Contains hyphens (penalty)
  const hyphenCount = (domain.match(/-/g) || []).length;
  score -= hyphenCount * 15;

  // Double letters (can be memorable)
  if (/(.)\1/.test(domain)) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Check if domain is likely a made-up word
 */
function isLikelyMadeUp(domain: string): boolean {
  // Heuristic: ends with common brandable suffixes
  const brandableSuffixes = ['ify', 'ly', 'io', 'sy', 'zy', 'hub', 'lab', 'kit', 'box'];
  return brandableSuffixes.some((suffix) => domain.endsWith(suffix));
}

/**
 * Check for repeating patterns
 */
function hasRepeatingPattern(domain: string): boolean {
  // Check for doubled words (e.g., "beepbeep")
  const halfLength = Math.floor(domain.length / 2);
  if (domain.length >= 6 && domain.length % 2 === 0) {
    const firstHalf = domain.slice(0, halfLength);
    const secondHalf = domain.slice(halfLength);
    if (firstHalf === secondHalf) {
      return true;
    }
  }

  // Check for doubled letters
  if (/(.)\1/.test(domain)) {
    return true;
  }

  return false;
}

/**
 * Check for alliteration (repeated starting sounds)
 */
function hasAlliteration(domain: string): boolean {
  // Simple check: if domain appears to be two words smashed together
  // with same starting letter
  const matches = domain.match(/([a-z])[a-z]*([a-z])[a-z]*/);
  if (matches && matches[1] === matches[2]) {
    return true;
  }
  return false;
}
