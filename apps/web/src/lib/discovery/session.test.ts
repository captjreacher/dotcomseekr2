import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SESSION_STORAGE_KEY,
  addToShortlist,
  emptySession,
  isSaved,
  loadSession,
  removeFromShortlist,
  saveSession,
  withBrand,
  withCheckedResults,
  withRound,
  withWorkingName,
} from './session.ts';
import type { BrandContext, CheckStatus, ShortlistEntry } from './types.ts';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const brand: BrandContext = {
  mode: 'word',
  original: 'clean',
  workingName: 'clean',
  meaning: 'Free from dirt or marks.',
  meaningSource: 'Free Dictionary API',
  commentary: 'Calm and dependable, not clinical.',
  extensions: ['com', 'ai'],
};

function entry(
  domain: string,
  status: Extract<CheckStatus, 'available' | 'premium'> = 'available'
) {
  const value: ShortlistEntry = {
    domain,
    status,
    price: status === 'premium' ? 499 : 10.88,
    currency: 'USD',
    checkedAt: '2026-10-25T01:00:00.000Z',
    registrationUrl: 'https://example.test/register',
    reason: 'Relates to the selected meaning.',
    technique: 'synonyms',
    savedAt: '2026-10-25T01:01:00.000Z',
  };

  return value;
}

describe('session persistence', () => {
  it('restores the brand and shortlist within the same tab session', () => {
    const storage = new MemoryStorage();
    const session = withBrand(emptySession(), brand);
    const saved = saveSession(addToShortlist(session, entry('spotless.com')), storage);

    const restored = loadSession(storage);

    assert.deepEqual(restored.brand, brand);
    assert.equal(restored.workingName, 'clean');
    assert.deepEqual(
      restored.shortlist.map((item) => item.domain),
      ['spotless.com']
    );
    assert.equal(saved.brand?.commentary, brand.commentary);
    assert.ok(storage.getItem(SESSION_STORAGE_KEY));
  });

  it('survives corrupt storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSION_STORAGE_KEY, '{not json');

    assert.deepEqual(loadSession(storage), emptySession());
  });

  it('keeps the anchor when the brand details are edited', () => {
    const branched = withWorkingName(withBrand(emptySession(), brand), 'spotless');
    const edited = withBrand(branched, { ...brand, commentary: 'Sharper, more precise.' });

    assert.equal(edited.brand?.original, 'clean');
    assert.equal(edited.brand?.commentary, 'Sharper, more precise.');
    assert.equal(edited.workingName, 'spotless');
  });
});

describe('shortlist', () => {
  it('deduplicates a name saved twice and keeps the first save time', () => {
    const once = addToShortlist(emptySession(), entry('spotless.com'));
    const twice = addToShortlist(once, {
      ...entry('spotless.com', 'premium'),
      savedAt: '2026-10-25T02:00:00.000Z',
    });

    assert.equal(twice.shortlist.length, 1);
    assert.equal(twice.shortlist[0].status, 'premium');
    assert.equal(twice.shortlist[0].savedAt, '2026-10-25T01:01:00.000Z');
    assert.equal(isSaved(twice, 'spotless.com'), true);
  });

  it('refuses to save a name that is not purchasable', () => {
    const session = emptySession();
    const taken = { ...entry('spotless.com'), status: 'taken' as unknown as 'available' };

    assert.equal(addToShortlist(session, taken).shortlist.length, 0);
  });

  it('removes a saved name', () => {
    const saved = addToShortlist(emptySession(), entry('spotless.com'));

    assert.equal(removeFromShortlist(saved, 'spotless.com').shortlist.length, 0);
    assert.equal(isSaved(removeFromShortlist(saved, 'spotless.com'), 'spotless.com'), false);
  });
});

describe('round state', () => {
  it('accumulates previously suggested spellings', () => {
    const session = withRound(emptySession(), {
      technique: 'synonyms',
      workingName: 'clean',
      variations: [
        { spelling: 'spotless', reason: 'Means clean.' },
        { spelling: 'tidy', reason: 'Means clean.' },
      ],
      rejected: [],
      checked: {},
      round: 1,
    });

    assert.deepEqual(session.seen, ['spotless', 'tidy']);
  });

  it('records checked availability for the current round only', () => {
    const session = withRound(emptySession(), {
      technique: 'synonyms',
      workingName: 'clean',
      variations: [],
      rejected: [],
      checked: {},
      round: 1,
    });

    const checked = withCheckedResults(session, [
      {
        domain: 'spotless.com',
        status: 'available',
        verified: true,
        price: 10.88,
        currency: 'USD',
        checkedAt: '2026-10-25T01:00:00.000Z',
        registrationUrl: 'https://example.test/register',
      },
    ]);

    assert.equal(checked.round?.checked['spotless.com'].status, 'available');
  });
});
