// Display mapping for availability answers.
//
// The four canonical labels come from the existing availability module so the
// guided journey and the legacy explorer can never name a state differently.
import { getAvailabilityLabel, isPurchasable } from '../availability.ts';
import type { CheckResult, CheckStatus, ShortlistEntry, Technique } from './types.ts';

export function labelForStatus(status: CheckStatus): string {
  return getAvailabilityLabel(status);
}

/** Tone suffix used by the badge styles: success, warn (premium), neutral, danger. */
export function toneForStatus(status: CheckStatus): 'available' | 'premium' | 'unknown' | 'taken' {
  return status === 'available'
    ? 'available'
    : status === 'premium'
      ? 'premium'
      : status === 'taken'
        ? 'taken'
        : 'unknown';
}

export function isPurchasableResult(result: CheckResult | null | undefined): boolean {
  return Boolean(result && result.verified && isPurchasable(result.status));
}

export function shortlistEntryFrom(
  result: CheckResult,
  options: { reason: string; technique: Technique; savedAt?: string }
): ShortlistEntry | null {
  if (result.status !== 'available' && result.status !== 'premium') return null;
  if (!result.verified) return null;

  return {
    domain: result.domain,
    status: result.status,
    price: result.price,
    currency: result.currency,
    checkedAt: result.checkedAt,
    registrationUrl: result.registrationUrl,
    reason: options.reason,
    technique: options.technique,
    savedAt: options.savedAt ?? new Date().toISOString(),
  };
}

/** Human price line, used in list rows without implying a completed purchase. */
export function priceLabel(price: number | null, currency: string): string {
  if (price === null || !Number.isFinite(price)) return '';
  const symbol = currency === 'USD' ? '$' : '';
  return `${symbol}${price.toFixed(2)}${symbol ? '' : ` ${currency}`}`;
}

/** Timestamp for provenance, shown in the shortlist. */
export function checkedLabel(checkedAt: string | null): string {
  if (!checkedAt) return 'Check time not reported';

  const date = new Date(checkedAt);
  if (Number.isNaN(date.getTime())) return 'Check time not reported';

  return `Checked ${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}
