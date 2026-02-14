import { IRegistrationProvider, AvailabilityResult, RegistrationResult } from './IRegistrationProvider';

/**
 * Mock registration provider for development
 */
export class MockRegistrationProvider implements IRegistrationProvider {
  async checkAvailability(domainName: string, tld: string): Promise<AvailabilityResult> {
    // TODO: Return mock availability data
    // - Randomly mark some as available/taken
    // - Randomly mark some as premium
    const available = Math.random() > 0.5;
    const premium = available && Math.random() > 0.8;

    return {
      available,
      premium,
      priceCents: premium ? 50000 : 1200,
    };
  }

  async registerDomain(domainName: string, tld: string): Promise<RegistrationResult> {
    // TODO: Mock registration (not implemented in v1)
    return {
      success: false,
      domainName: `${domainName}.${tld}`,
      error: 'Registration not yet implemented',
    };
  }
}
