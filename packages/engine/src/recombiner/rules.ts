/**
 * Domain name formation rules and constraints
 */

export const DOMAIN_RULES = {
  MIN_LENGTH: 3,
  MAX_LENGTH: 63,
  VALID_CHARS: /^[a-z0-9-]+$/,
  NO_LEADING_HYPHEN: /^[^-]/,
  NO_TRAILING_HYPHEN: /[^-]$/,
};

export function isValidDomainName(name: string): boolean {
  // TODO: Validate domain name against rules
  return (
    name.length >= DOMAIN_RULES.MIN_LENGTH &&
    name.length <= DOMAIN_RULES.MAX_LENGTH &&
    DOMAIN_RULES.VALID_CHARS.test(name) &&
    DOMAIN_RULES.NO_LEADING_HYPHEN.test(name) &&
    DOMAIN_RULES.NO_TRAILING_HYPHEN.test(name)
  );
}

export function isPronounceab(name: string): boolean {
  // Must have at least one vowel
  if (!/[aeiou]/.test(name)) {
    return false;
  }

  // No more than 4 consecutive consonants
  if (/[bcdfghjklmnpqrstvwxyz]{5,}/.test(name)) {
    return false;
  }

  // No more than 3 consecutive vowels
  if (/[aeiou]{4,}/.test(name)) {
    return false;
  }

  // Check for difficult consonant clusters
  const difficultClusters = ['bq', 'fq', 'gq', 'jq', 'kq', 'pq', 'vq', 'wq', 'xq', 'zq'];
  for (const cluster of difficultClusters) {
    if (name.includes(cluster)) {
      return false;
    }
  }

  return true;
}
