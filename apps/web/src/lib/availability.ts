import type { Candidate } from '../services/api';

/**
 * Availability states written by the backend (`availability_status`).
 *
 * These four states are deliberately kept distinct. Collapsing them into a
 * boolean misreads two very different things as "eliminated":
 *
 * - `unknown` means the name has not been checked yet (every freshly expanded
 *   candidate starts here), so it must never be treated as taken.
 * - `premium` is purchasable at a premium price, so it must never be treated
 *   as taken.
 */
export type AvailabilityStatus = 'unknown' | 'available' | 'premium' | 'taken';

/** All known states, in the order they are banded for display. */
export const AVAILABILITY_STATUSES: readonly AvailabilityStatus[] = [
  'available',
  'premium',
  'unknown',
  'taken',
];

/** Registrar-neutral fallback label for a completed availability check. */
export const DEFAULT_CHECK_LABEL = 'Live availability checked';

/** Anything carrying a backend availability state. */
export interface AvailabilitySubject {
  availability_status?: string | null;
}

/** A subject that can also be ordered by score inside an availability band. */
export interface AvailabilitySortable extends AvailabilitySubject {
  score_total?: number | null;
}

/** Accepted inputs for the predicates: a raw status or a candidate-like subject. */
export type AvailabilityInput =
  | AvailabilityStatus
  | string
  | null
  | undefined
  | AvailabilitySubject;

/** Normalizes any raw backend value into one of the four known states. */
export function normalizeAvailabilityStatus(value: unknown): AvailabilityStatus {
  if (typeof value !== 'string') return 'unknown';

  switch (value.trim().toLowerCase()) {
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

/** Reads the normalized availability state off a candidate-like subject. */
export function getAvailabilityStatus(
  subject: AvailabilitySubject | null | undefined
): AvailabilityStatus {
  return normalizeAvailabilityStatus(subject?.availability_status);
}

function resolveAvailabilityStatus(input: AvailabilityInput): AvailabilityStatus {
  if (input !== null && typeof input === 'object') {
    return getAvailabilityStatus(input);
  }

  return normalizeAvailabilityStatus(input);
}

/** Purchasable now, either at standard price or at a premium price. */
export function isPurchasable(input: AvailabilityInput): boolean {
  const status = resolveAvailabilityStatus(input);
  return status === 'available' || status === 'premium';
}

/** Checked at least once: available, premium or taken. `unknown` is not checked. */
export function isChecked(input: AvailabilityInput): boolean {
  return resolveAvailabilityStatus(input) !== 'unknown';
}

/** Eliminated: only `taken` is unavailable. `unknown` and `premium` are not. */
export function isUnavailable(input: AvailabilityInput): boolean {
  return resolveAvailabilityStatus(input) === 'taken';
}

/** Not checked yet. Every freshly expanded candidate starts here. */
export function isUnchecked(input: AvailabilityInput): boolean {
  return resolveAvailabilityStatus(input) === 'unknown';
}

/**
 * Display band for availability-first ordering.
 *
 * Purchasable names (`available` and `premium`) share a band so that score
 * ordering decides between them; `unknown` stays a distinct band between the
 * purchasable names and the eliminated ones.
 */
export function availabilityRank(input: AvailabilityInput): number {
  switch (resolveAvailabilityStatus(input)) {
    case 'available':
    case 'premium':
      return 0;
    case 'unknown':
      return 1;
    default:
      return 2;
  }
}

/** Registrar-neutral human label for an availability state. */
export function getAvailabilityLabel(input: AvailabilityInput): string {
  switch (resolveAvailabilityStatus(input)) {
    case 'available':
      return 'Available';
    case 'premium':
      return 'Premium available';
    case 'taken':
      return 'Not available';
    default:
      return 'Not checked yet';
  }
}

/**
 * Registrar-neutral check label for a candidate.
 *
 * The provider actually used is never surfaced to users, so this only ever
 * returns the candidate's own neutral label or the shared default.
 */
export function getCheckLabel(
  candidate: Pick<Candidate, 'availability_data'> | null | undefined
): string {
  const value = candidate?.availability_data?.checkLabel;

  if (typeof value === 'string' && value.trim()) return value;

  return DEFAULT_CHECK_LABEL;
}

function scoreOf(subject: AvailabilitySortable): number {
  const value = subject.score_total;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Availability band first, then score (descending) within that band. */
export function compareByAvailability(a: AvailabilitySortable, b: AvailabilitySortable): number {
  const rankDelta = availabilityRank(a) - availabilityRank(b);
  if (rankDelta !== 0) return rankDelta;

  return scoreOf(b) - scoreOf(a);
}

/**
 * Availability-first ordering for the results rail:
 * available/premium, then unknown, then taken.
 *
 * This is a pure sort: it never filters, so unknown candidates are reordered
 * but never hidden. Ties keep their original relative order.
 */
export function sortByAvailability<T extends AvailabilitySortable>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compareByAvailability(a.item, b.item) || a.index - b.index)
    .map(({ item }) => item);
}
