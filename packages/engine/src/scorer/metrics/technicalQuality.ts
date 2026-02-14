/**
 * Scores technical domain quality (0-100)
 */
export function scoreTechnicalQuality(domain: string): number {
  let score = 100;

  // Length (ideal: 5-15 characters)
  const length = domain.length;
  if (length < 3) {
    score = 0; // Too short
  } else if (length >= 5 && length <= 15) {
    // Ideal length
  } else if (length < 5) {
    score -= (5 - length) * 10;
  } else if (length > 15) {
    score -= (length - 15) * 5;
  }

  // Hyphen penalties
  const hyphenCount = (domain.match(/-/g) || []).length;
  score -= hyphenCount * 20;

  // Leading or trailing hyphen (invalid)
  if (domain.startsWith('-') || domain.endsWith('-')) {
    score = 0;
  }

  // Number penalties
  const numberCount = (domain.match(/\d/g) || []).length;
  score -= numberCount * 15;

  // Mixed case (should be lowercase for domains)
  if (domain !== domain.toLowerCase()) {
    score -= 20;
  }

  // Special characters (only hyphens allowed)
  if (/[^a-z0-9-]/.test(domain)) {
    score = 0;
  }

  // Consecutive hyphens (invalid)
  if (domain.includes('--')) {
    score = 0;
  }

  // All numbers (poor quality)
  if (/^\d+$/.test(domain)) {
    score = 0;
  }

  // Single character (invalid for most TLDs)
  if (length === 1) {
    score = 0;
  }

  // Over 63 characters (invalid)
  if (length > 63) {
    score = 0;
  }

  return Math.max(0, Math.min(100, score));
}
