import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Candidate } from '../services/api';
import {
  DEFAULT_CHECK_LABEL,
  availabilityRank,
  compareByAvailability,
  getAvailabilityLabel,
  getAvailabilityStatus,
  getCheckLabel,
  isChecked,
  isPurchasable,
  isUnavailable,
  isUnchecked,
  normalizeAvailabilityStatus,
  sortByAvailability,
} from './availability.ts';

const PROVIDER_NAMES = /dynadot|namecheap|godaddy|porkbun|cloudflare/i;

function candidate(
  domain_name: string,
  availability_status: string | undefined,
  score_total: number,
  availability_data?: Record<string, unknown>
): Candidate {
  return {
    id: domain_name,
    project_id: 'project-1',
    domain_name,
    tld: 'com',
    score_total,
    score_pronounceability: score_total,
    score_brandability: score_total,
    score_semantic_fit: score_total,
    score_technical_quality: score_total,
    availability_status,
    availability_data,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('normalizeAvailabilityStatus', () => {
  it('keeps the four backend states distinct', () => {
    assert.equal(normalizeAvailabilityStatus('available'), 'available');
    assert.equal(normalizeAvailabilityStatus('premium'), 'premium');
    assert.equal(normalizeAvailabilityStatus('taken'), 'taken');
    assert.equal(normalizeAvailabilityStatus('unknown'), 'unknown');
  });

  it('normalizes case and surrounding whitespace', () => {
    assert.equal(normalizeAvailabilityStatus(' PREMIUM '), 'premium');
    assert.equal(normalizeAvailabilityStatus('Taken'), 'taken');
  });

  it('falls back to unknown instead of guessing', () => {
    for (const value of [undefined, null, '', '   ', 'pending', 42, {}, []]) {
      assert.equal(normalizeAvailabilityStatus(value), 'unknown');
    }
  });
});

describe('domain model predicates', () => {
  it('available is purchasable and checked', () => {
    assert.equal(isPurchasable('available'), true);
    assert.equal(isChecked('available'), true);
    assert.equal(isUnavailable('available'), false);
    assert.equal(isUnchecked('available'), false);
  });

  it('premium is purchasable and checked, and is never taken', () => {
    assert.equal(isPurchasable('premium'), true);
    assert.equal(isChecked('premium'), true);
    assert.equal(isUnavailable('premium'), false);
    assert.equal(isUnchecked('premium'), false);
  });

  it('unknown is neither purchasable nor taken, and reads as unchecked', () => {
    assert.equal(isPurchasable('unknown'), false);
    assert.equal(isChecked('unknown'), false);
    assert.equal(isUnchecked('unknown'), true);
    assert.equal(isUnavailable('unknown'), false);
  });

  it('taken is unavailable but still checked', () => {
    assert.equal(isPurchasable('taken'), false);
    assert.equal(isChecked('taken'), true);
    assert.equal(isUnchecked('taken'), false);
    assert.equal(isUnavailable('taken'), true);
  });

  it('accepts candidate-like subjects as well as raw statuses', () => {
    const fresh = candidate('freshidea', undefined, 70);
    const premium = candidate('premiumidea', 'premium', 70);
    const taken = candidate('takenidea', 'taken', 70);

    assert.equal(getAvailabilityStatus(fresh), 'unknown');
    assert.equal(isUnavailable(fresh), false);
    assert.equal(isUnchecked(fresh), true);

    assert.equal(isPurchasable(premium), true);
    assert.equal(isUnavailable(premium), false);

    assert.equal(isUnavailable(taken), true);
    assert.equal(isPurchasable(taken), false);
  });

  it('ranks purchasable first, unchecked next, taken last', () => {
    assert.equal(availabilityRank('available'), 0);
    assert.equal(availabilityRank('premium'), 0);
    assert.equal(availabilityRank('unknown'), 1);
    assert.equal(availabilityRank('taken'), 2);
  });
});

describe('getAvailabilityLabel', () => {
  it('uses registrar-neutral wording for every state', () => {
    assert.equal(getAvailabilityLabel('available'), 'Available');
    assert.equal(getAvailabilityLabel('premium'), 'Premium available');
    assert.equal(getAvailabilityLabel('unknown'), 'Not checked yet');
    assert.equal(getAvailabilityLabel('taken'), 'Not available');
  });

  it('never names a registrar for premium names', () => {
    assert.doesNotMatch(getAvailabilityLabel('premium'), PROVIDER_NAMES);
    assert.equal(isUnavailable('premium'), false);
    assert.equal(getAvailabilityLabel('premium'), 'Premium available');
  });
});

describe('getCheckLabel', () => {
  it('returns the candidate label when one is present', () => {
    const withLabel = candidate('labelled', 'available', 70, { checkLabel: 'Confirmed today' });
    assert.equal(getCheckLabel(withLabel), 'Confirmed today');
  });

  it('falls back to the shared neutral default', () => {
    assert.equal(getCheckLabel(undefined), DEFAULT_CHECK_LABEL);
    assert.equal(getCheckLabel(candidate('plain', 'available', 70)), DEFAULT_CHECK_LABEL);
    assert.equal(
      getCheckLabel(candidate('blank', 'available', 70, { checkLabel: '   ' })),
      DEFAULT_CHECK_LABEL
    );
    assert.equal(
      getCheckLabel(candidate('numeric', 'available', 70, { checkLabel: 7 })),
      DEFAULT_CHECK_LABEL
    );
  });

  it('never exposes a provider name', () => {
    assert.doesNotMatch(DEFAULT_CHECK_LABEL, PROVIDER_NAMES);
  });
});

describe('sortByAvailability', () => {
  it('orders purchasable, then unchecked, then taken', () => {
    const items = [
      candidate('taken-high', 'taken', 99),
      candidate('unchecked-a', undefined, 60),
      candidate('available-low', 'available', 40),
      candidate('premium-high', 'premium', 88),
      candidate('taken-low', 'taken', 10),
      candidate('unchecked-b', 'unknown', 75),
    ];

    assert.deepEqual(
      sortByAvailability(items).map((item) => item.domain_name),
      ['premium-high', 'available-low', 'unchecked-b', 'unchecked-a', 'taken-high', 'taken-low']
    );
  });

  it('preserves score ordering within a band', () => {
    const items = [
      candidate('available-50', 'available', 50),
      candidate('premium-72', 'premium', 72),
      candidate('available-90', 'available', 90),
    ];

    assert.deepEqual(
      sortByAvailability(items).map((item) => item.domain_name),
      ['available-90', 'premium-72', 'available-50']
    );
  });

  it('keeps ties in their original relative order', () => {
    const items = [
      candidate('first', 'available', 70),
      candidate('second', 'premium', 70),
      candidate('third', 'available', 70),
    ];

    assert.deepEqual(
      sortByAvailability(items).map((item) => item.domain_name),
      ['first', 'second', 'third']
    );
  });

  it('never hides unchecked candidates', () => {
    const items = [
      candidate('checked-a', 'available', 80),
      candidate('fresh-a', undefined, 70),
      candidate('fresh-b', 'unknown', 65),
      candidate('fresh-c', undefined, 60),
      candidate('gone', 'taken', 90),
    ];

    const sorted = sortByAvailability(items);

    assert.equal(sorted.length, items.length);
    assert.deepEqual(
      sorted.filter((item) => isUnchecked(item)).map((item) => item.domain_name),
      ['fresh-a', 'fresh-b', 'fresh-c']
    );
    assert.deepEqual(new Set(sorted), new Set(items));
    assert.ok(sorted.every((item) => items.includes(item)));
  });

  it('is a pure, non-mutating sort', () => {
    const items = [
      candidate('taken', 'taken', 90),
      candidate('fresh', undefined, 70),
      candidate('available', 'available', 60),
    ];
    const originalOrder = items.map((item) => item.domain_name);

    const sorted = sortByAvailability(items);

    assert.notEqual(sorted, items);
    assert.deepEqual(
      items.map((item) => item.domain_name),
      originalOrder
    );
    assert.notEqual(sorted[0], items[0]);
  });

  it('handles empty input and missing scores', () => {
    assert.deepEqual(sortByAvailability([]), []);
    assert.deepEqual(
      sortByAvailability([
        candidate('no-score-a', 'available', Number.NaN),
        candidate('no-score-b', 'unknown', 0),
      ]).map((item) => item.domain_name),
      ['no-score-a', 'no-score-b']
    );
  });

  it('exposes a stable comparator for callers doing their own sorting', () => {
    const a = candidate('a', 'premium', 70);
    const b = candidate('b', 'taken', 70);
    const c = candidate('c', 'premium', 70);

    assert.ok(compareByAvailability(a, b) < 0);
    assert.ok(compareByAvailability(b, a) > 0);
    assert.equal(compareByAvailability(a, c), 0);
  });
});
