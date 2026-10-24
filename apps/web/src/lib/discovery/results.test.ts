import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  checkedLabel,
  isPurchasableResult,
  labelForStatus,
  priceLabel,
  shortlistEntryFrom,
  toneForStatus,
} from './results.ts';
import type { CheckResult } from './types.ts';

function result(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    domain: 'spotless.com',
    status: 'available',
    verified: true,
    price: 10.88,
    currency: 'USD',
    checkedAt: '2026-10-25T01:02:03.000Z',
    registrationUrl: 'https://example.test/register',
    ...overrides,
  };
}

describe('availability labels', () => {
  it('uses the canonical labels for all four states', () => {
    assert.equal(labelForStatus('available'), 'Available');
    assert.equal(labelForStatus('premium'), 'Premium available');
    assert.equal(labelForStatus('taken'), 'Not available');
    assert.equal(labelForStatus('unknown'), 'Unable to verify');
  });

  it('gives an unverified name a neutral badge, not a success one', () => {
    assert.equal(toneForStatus('unknown'), 'unknown');
    assert.equal(toneForStatus('taken'), 'taken');
    assert.equal(toneForStatus('premium'), 'premium');
  });
});

describe('purchasability', () => {
  it('never treats an unverified answer as purchasable', () => {
    assert.equal(isPurchasableResult(result({ verified: false })), false);
    assert.equal(isPurchasableResult(result()), true);
    assert.equal(isPurchasableResult(result({ status: 'taken' })), false);
  });

  it('saves only verified purchasable names', () => {
    const available = shortlistEntryFrom(result(), {
      reason: 'reason',
      technique: 'synonyms',
    });
    assert.equal(available?.domain, 'spotless.com');
    assert.equal(available?.price, 10.88);

    const premium = shortlistEntryFrom(result({ status: 'premium', price: 499 }), {
      reason: 'reason',
      technique: 'synonyms',
    });
    assert.equal(premium?.status, 'premium');

    assert.equal(
      shortlistEntryFrom(result({ verified: false }), { reason: 'reason', technique: 'synonyms' }),
      null
    );
    assert.equal(
      shortlistEntryFrom(result({ status: 'taken' }), { reason: 'reason', technique: 'synonyms' }),
      null
    );
  });
});

describe('provenance labels', () => {
  it('renders a price only when one was reported', () => {
    assert.equal(priceLabel(10.88, 'USD'), '$10.88');
    assert.equal(priceLabel(null, 'USD'), '');
  });

  it('renders the provider check time', () => {
    assert.equal(checkedLabel('2026-10-25T01:02:03.000Z'), 'Checked 2026-10-25 01:02 UTC');
    assert.equal(checkedLabel(null), 'Check time not reported');
    assert.equal(checkedLabel('nonsense'), 'Check time not reported');
  });
});
