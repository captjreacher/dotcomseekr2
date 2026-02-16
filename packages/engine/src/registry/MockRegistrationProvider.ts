import {
  IRegistrationProvider,
  AvailabilityResult,
  RegistrationResult,
} from './IRegistrationProvider';

/**
 * Simple hash function for deterministic pseudo-randomness
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Mock registration provider with deterministic availability simulation
 * Uses domain name hash to consistently return the same result for the same domain
 */
export class MockRegistrationProvider implements IRegistrationProvider {
  /**
   * Check domain availability (deterministic based on domain name)
   * ~60% available, ~40% taken
   * Of available: ~15% premium, ~85% standard
   */
  async checkAvailability(
    domainName: string,
    tld: string
  ): Promise<AvailabilityResult> {
    const fullDomain = `${domainName}.${tld}`;
    const hash = hashString(fullDomain);

    // Deterministic availability: 60% available
    const available = hash % 100 < 60;

    if (!available) {
      return {
        available: false,
        premium: false,
        priceCents: 0,
      };
    }

    // Of available domains, 15% are premium
    const premium = hash % 100 >= 85;

    // Pricing varies slightly based on length and hash
    const basePrice = 1200; // $12.00
    const premiumMultiplier = 20 + (hash % 100); // 20x-120x for premium
    const lengthBonus = Math.max(0, 8 - domainName.length) * 100; // Shorter = more expensive

    const priceCents = premium
      ? basePrice * premiumMultiplier + lengthBonus
      : basePrice + (hash % 500); // Standard: $12-$17

    return {
      available,
      premium,
      priceCents,
    };
  }

  /**
   * Mock domain registration (not implemented in v1)
   */
  async registerDomain(
    domainName: string,
    tld: string
  ): Promise<RegistrationResult> {
    return {
      success: false,
      domainName: `${domainName}.${tld}`,
      error: 'Registration not yet implemented',
    };
  }

  /**
   * Check multiple domains at once (batch operation)
   */
  async checkBatchAvailability(
    domains: Array<{ name: string; tld: string }>
  ): Promise<Map<string, AvailabilityResult>> {
    const results = new Map<string, AvailabilityResult>();

    for (const domain of domains) {
      const fullDomain = `${domain.name}.${domain.tld}`;
      const result = await this.checkAvailability(domain.name, domain.tld);
      results.set(fullDomain, result);
    }

    return results;
  }
}
