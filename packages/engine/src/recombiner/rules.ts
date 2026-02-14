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
  // TODO: Check pronounceability heuristics
  return true;
}
