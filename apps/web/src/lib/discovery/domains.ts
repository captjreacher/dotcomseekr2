// Domain construction and validation shared by the browser and the edge API.
//
// Everything here is about *exact* names: joining a phrase into one label,
// turning selected extensions into concrete domains, and rejecting input that
// is not a registrable name. No name generation lives in this module.
import type { BrandContext, CheckResult, CheckStatus, DiscoveryMode } from './types.ts';

/** Extensions the registrar-backed checker supports. */
export const ALLOWED_EXTENSIONS = ['com', 'ai', 'io', 'co', 'net', 'org'] as const;

/** One check request may cover at most this many domains (registrar pacing). */
export const MAX_CHECK_DOMAINS = 15;

/** A single search round proposes at most this many variations. */
export const MAX_VARIATIONS_PER_ROUND = 5;

const LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Trim and collapse whitespace, keeping the user's words intact. */
export function normalizeOriginal(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export function isAllowedExtension(extension: string): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extension);
}

/**
 * Request body for an exact check.
 *
 * It carries exactly the one name the user typed: the exact search never asks
 * the backend for generated alternatives.
 */
export function exactCheckPayload(
  input: string
): { body: { action: 'check'; domains: string[] } } | { error: string } {
  const parsed = parseExactDomain(input);
  if (parsed.error) return { error: parsed.error };

  return { body: { action: 'check', domains: [parsed.domain] } };
}

/** Validate a single lowercase domain label (no dot, no scheme). */
export function isValidLabel(label: string): boolean {
  return LABEL_PATTERN.test(label);
}

/**
 * Join a word or phrase into one domain label.
 *
 * A phrase is joined without invented separators; hyphens are only ever
 * introduced by the hyphens technique.
 */
export function joinLabel(name: string): string {
  return normalizeOriginal(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 63);
}

/** Concrete domains for one name and the user's selected extensions. */
export function domainsFor(name: string, extensions: readonly string[]): string[] {
  const label = joinLabel(name);
  if (!label || !isValidLabel(label)) return [];

  return dedupe(
    extensions
      .map((extension) => extension.toLowerCase().replace(/^\./, '').trim())
      .filter(isAllowedExtension)
      .map((extension) => `${label}.${extension}`)
  );
}

/** The name's domain spelling, before extensions (phrases are joined). */
export function spellingPreview(name: string): string {
  return joinLabel(name);
}

export interface ExactDomainInput {
  domain: string;
  error?: string;
}

/**
 * Parse one exact domain exactly as typed.
 *
 * Schemes, paths, `www.` and a trailing dot are stripped; no alternative names
 * are produced and no extension is added.
 */
export function parseExactDomain(input: string): ExactDomainInput {
  let value = normalizeOriginal(input).toLowerCase();

  value = value.replace(/^https?:\/\//, '').replace(/^www\./, '');
  value = value.split('/')[0] ?? '';
  value = value.split('?')[0] ?? '';
  value = value.replace(/\.$/, '');

  if (!value) return { domain: '', error: 'Enter a domain to check, for example clean.com.' };

  if (!value.includes('.')) {
    return {
      domain: '',
      error: 'Include an extension, for example clean.com. Extensions are never added for you.',
    };
  }

  const [label, ...rest] = value.split('.');
  const extension = rest.join('.');

  if (!isValidLabel(label)) {
    return { domain: '', error: 'Use letters, numbers or hyphens, without spaces.' };
  }

  if (!isAllowedExtension(extension)) {
    return { domain: '', error: `We can only check .${ALLOWED_EXTENSIONS.join(', .')} right now.` };
  }

  return { domain: `${label}.${extension}` };
}

/**
 * Validate the domains of one check request.
 *
 * Rejects anything the registrar cannot be asked about, and refuses to exceed
 * the shared batch ceiling so a single round cannot exhaust the rate budget.
 */
export function parseCheckDomains(
  input: unknown
): { domains: string[]; error?: undefined } | { domains: []; error: string } {
  const raw = Array.isArray(input) ? input : [];
  const domains: string[] = [];

  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const parsed = parseExactDomain(item);
    if (parsed.error) continue;
    if (!domains.includes(parsed.domain)) domains.push(parsed.domain);
  }

  if (domains.length === 0) return { domains: [], error: 'No checkable domains were supplied.' };
  if (domains.length > MAX_CHECK_DOMAINS) {
    return {
      domains: [],
      error: `Check at most ${MAX_CHECK_DOMAINS} domains at a time.`,
    };
  }

  return { domains };
}

/**
 * Domains for a set of chosen spellings, limited to the user's extensions.
 *
 * This is the only place a check batch is assembled, so a request can never
 * carry an extension the user did not select.
 */
export function domainsForSelection(
  spellings: readonly string[],
  extensions: readonly string[]
): string[] {
  const allowed = extensions.map((extension) => extension.toLowerCase()).filter(isAllowedExtension);
  const domains = spellings.flatMap((spelling) => domainsFor(spelling, allowed));

  return dedupe(domains).slice(0, MAX_CHECK_DOMAINS);
}

export function extensionOf(domain: string): string {
  return domain.split('.').slice(1).join('.');
}

export function labelOf(domain: string): string {
  return domain.split('.')[0] ?? domain;
}

/** Compact one-line summary of the brand the user established. */
export function brandSummary(brand: BrandContext): string {
  const parts = [brand.mode === 'phrase' ? 'Phrase' : 'One word', `“${brand.original}”`];

  if (brand.workingName && joinLabel(brand.workingName) !== joinLabel(brand.original)) {
    parts.push(`exploring “${brand.workingName}”`);
  }

  if (brand.extensions.length > 0) {
    parts.push(brand.extensions.map((extension) => `.${extension}`).join(' '));
  }

  return parts.join(' · ');
}

/** Whether a mode requires more than one word. */
export function matchesMode(name: string, mode: DiscoveryMode): boolean {
  const words = normalizeOriginal(name).split(' ').filter(Boolean);
  return mode === 'phrase' ? words.length >= 2 : words.length === 1;
}

function dedupe<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/**
 * Normalize one raw availability answer from the API.
 *
 * Only a live, verified answer can be available, premium or taken. Anything
 * else — a mock/fallback row, a missing answer, an ambiguous payload — becomes
 * `unknown`, which the UI renders as "Unable to verify".
 */
export function toCheckResult(raw: unknown): CheckResult | null {
  if (!raw || typeof raw !== 'object') return null;

  const value = raw as Record<string, unknown>;
  const domain = typeof value.domain === 'string' ? value.domain.trim().toLowerCase() : '';
  if (!domain) return null;

  const verified = value.verified === true;
  const status = verified ? normalizeVerifiedStatus(value.status) : 'unknown';
  const checkedAt = typeof value.checkedAt === 'string' ? value.checkedAt : null;
  const price =
    typeof value.price === 'number' && Number.isFinite(value.price) ? value.price : null;
  const currency =
    typeof value.currency === 'string' && value.currency.trim() ? value.currency : 'USD';
  const registrationUrl =
    status === 'available' || status === 'premium'
      ? typeof value.registrationUrl === 'string' && value.registrationUrl.trim()
        ? value.registrationUrl
        : null
      : null;
  const reason =
    status === 'unknown' && typeof value.reason === 'string' && value.reason.trim()
      ? value.reason.trim()
      : undefined;

  return { domain, status, verified, price, currency, checkedAt, registrationUrl, reason };
}

function normalizeVerifiedStatus(raw: unknown): CheckStatus {
  switch (typeof raw === 'string' ? raw.trim().toLowerCase() : '') {
    case 'available':
      return 'available';
    case 'premium':
      return 'premium';
    case 'taken':
      return 'taken';
    default:
      return 'unknown';
  }
}
