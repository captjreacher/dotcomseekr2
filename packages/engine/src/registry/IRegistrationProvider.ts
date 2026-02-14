/**
 * Interface for domain registration providers
 */
export interface IRegistrationProvider {
  /**
   * Checks if a domain is available for registration
   */
  checkAvailability(domainName: string, tld: string): Promise<AvailabilityResult>;

  /**
   * Registers a domain (future implementation)
   */
  registerDomain(domainName: string, tld: string): Promise<RegistrationResult>;
}

export interface AvailabilityResult {
  available: boolean;
  premium: boolean;
  priceCents: number;
}

export interface RegistrationResult {
  success: boolean;
  domainName: string;
  error?: string;
}
