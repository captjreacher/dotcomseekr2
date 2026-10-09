import type { AvailabilityCheckPayload } from '../services/api';
import {
  getAvailabilityLabel,
  isPurchasable,
  normalizeAvailabilityStatus,
} from './availability.ts';

/**
 * Registrar-neutral message shown whenever a real availability answer could not
 * be established. It never names a provider and never guesses a state.
 */
export const AVAILABILITY_ERROR_MESSAGE = 'Availability could not be established.';

/** TLDs the backend can check. Mirrors the edge function allowlist. */
export const QUICK_CHECK_TLDS = ['com', 'ai', 'io', 'co', 'net', 'org'] as const;

/**
 * A single domain label. Mirrors `@dotcomseekr/shared`'s `isValidDomainName`
 * (the rules the edge function enforces), lowercased before testing.
 */
const DOMAIN_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Only the states that can come from a real, completed provider check. */
export type QuickCheckStatus = 'available' | 'premium' | 'taken';

export interface NormalizedDomain {
  domain: string;
  label: string;
  tld: string;
}

export type DomainParseResult =
  | { ok: true; value: NormalizedDomain }
  | { ok: false; message: string };

export interface QuickCheckResult {
  domain: string;
  status: QuickCheckStatus;
  price: number | null;
  currency: string;
  registrationUrl: string | null;
  checkedAt: string | null;
}

export interface QuickCheckError {
  domain: string | null;
  message: string;
}

export type QuickCheckOutcome =
  | { kind: 'result'; result: QuickCheckResult }
  | { kind: 'error'; error: QuickCheckError };

function normalizeInput(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split(/[/?#]/)[0]
      ?.replace(/\.$/, '') ?? ''
  );
}

function fail(message: string): DomainParseResult {
  return { ok: false, message };
}

/**
 * Normalizes and validates one exact domain typed by the user. Invalid input is
 * rejected here, before any provider call.
 */
export function parseDomainInput(raw: string): DomainParseResult {
  const value = normalizeInput(raw);

  if (!value) return fail('Enter a domain to check.');
  if (!value.includes('.')) return fail('Use a full domain, like agent.com.');

  const labels = value.split('.');
  if (labels.length !== 2) return fail('Check one domain at a time, like agent.com.');

  const [label, tld] = labels;
  if (!(QUICK_CHECK_TLDS as readonly string[]).includes(tld)) {
    return fail(`We can only check ${QUICK_CHECK_TLDS.map((item) => `.${item}`).join(', ')} right now.`);
  }
  if (!DOMAIN_LABEL.test(label) || !DOMAIN_LABEL.test(tld)) {
    return fail('That domain is not valid.');
  }

  return { ok: true, value: { domain: `${label}.${tld}`, label, tld } };
}

function resolveStatus(payload: AvailabilityCheckPayload): QuickCheckStatus | null {
  if (typeof payload.status === 'string') {
    const normalized = normalizeAvailabilityStatus(payload.status);
    if (normalized !== 'unknown') return normalized;
  }

  // Tolerate the local Fastify shape, which reports booleans instead of a status.
  if (typeof payload.available === 'boolean') {
    if (!payload.available) return 'taken';
    return payload.premium === true ? 'premium' : 'available';
  }

  return null;
}

function resolvePrice(payload: AvailabilityCheckPayload): number | null {
  if (typeof payload.price === 'number' && Number.isFinite(payload.price)) return payload.price;
  if (typeof payload.priceCents === 'number' && Number.isFinite(payload.priceCents)) {
    return payload.priceCents / 100;
  }
  return null;
}

function resolveRegistrationUrl(payload: AvailabilityCheckPayload): string | null {
  return typeof payload.registrationUrl === 'string' && payload.registrationUrl.trim()
    ? payload.registrationUrl
    : null;
}

/**
 * Maps a raw backend payload onto the four-state availability contract.
 *
 * Provider failures, mock/fallback responses, missing metadata and unknown
 * states all become an error — never "available" or "not available". A real
 * answer is only accepted from a non-mock provider that reports a live or
 * sandbox mode.
 */
export function interpretAvailability(
  domain: string,
  payload: AvailabilityCheckPayload | null | undefined
): QuickCheckOutcome {
  const error: QuickCheckOutcome = {
    kind: 'error',
    error: { domain, message: AVAILABILITY_ERROR_MESSAGE },
  };

  if (!payload) return error;

  const provider = typeof payload.provider === 'string' ? payload.provider.toLowerCase() : '';
  const mode = typeof payload.mode === 'string' ? payload.mode.toLowerCase() : '';
  const isLiveProvider = provider !== '' && provider !== 'mock' && mode !== '' && mode !== 'mock';

  if (typeof payload.error === 'string' && payload.error.trim()) return error;
  if (!isLiveProvider) return error;

  const status = resolveStatus(payload);
  if (!status) return error;

  return {
    kind: 'result',
    result: {
      domain,
      status,
      price: resolvePrice(payload),
      currency: typeof payload.currency === 'string' && payload.currency ? payload.currency : 'USD',
      registrationUrl: resolveRegistrationUrl(payload),
      checkedAt: typeof payload.checkedAt === 'string' ? payload.checkedAt : null,
    },
  };
}

/** Registrar-neutral label for a resolved availability state. */
export function quickCheckLabel(status: QuickCheckStatus): string {
  return getAvailabilityLabel(status);
}

/** A registration link is only offered for purchasable states. */
export function registrationUrlFor(outcome: QuickCheckOutcome): string | null {
  if (outcome.kind !== 'result') return null;
  if (!isPurchasable(outcome.result.status)) return null;
  return outcome.result.registrationUrl;
}

/** Human-readable price for a resolved state, or null when none is reliable. */
export function formatPrice(result: QuickCheckResult): string | null {
  if (result.price === null || !Number.isFinite(result.price)) return null;

  const currency = result.currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(result.price);
  } catch {
    return `${result.price} ${currency}`;
  }
}

/**
 * Monotonic gate that lets callers ignore superseded checks.
 *
 * `begin()` starts a new check and returns its token; `isCurrent(token)` is only
 * true for the most recently started check, so a slow earlier response can never
 * overwrite a newer one.
 */
export function createLatestGate() {
  let current = 0;

  return {
    begin(): number {
      current += 1;
      return current;
    },
    isCurrent(token: number): boolean {
      return token === current;
    },
  };
}
