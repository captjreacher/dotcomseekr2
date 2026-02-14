export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidDomainName(domain: string): boolean {
  const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
  return domainRegex.test(domain);
}
