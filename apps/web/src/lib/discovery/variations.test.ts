import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BANNED_CLAIM_LABELS,
  TECHNIQUE_DESCRIPTIONS,
  TECHNIQUE_LABELS,
  techniqueAvailable,
} from './techniques.ts';
import { sanitizeVariations, type VariationContext } from './variations.ts';
import type { Technique } from './types.ts';

function context(
  technique: Technique,
  overrides: Partial<VariationContext> = {}
): VariationContext {
  return {
    technique,
    mode: 'word',
    workingName: 'clean',
    original: 'clean',
    previous: [],
    ...overrides,
  };
}

const variation = (
  spelling: string,
  reason = 'Relates to the selected meaning.',
  changedWord?: string
) => ({
  spelling,
  reason,
  ...(changedWord ? { changedWord } : {}),
});

describe('variation limits', () => {
  it('keeps at most five suggestions per round', () => {
    const raw = {
      variations: ['spotless', 'tidy', 'neat', 'pure', 'fresh', 'sleek', 'trim'].map((spelling) =>
        variation(spelling)
      ),
    };

    const result = sanitizeVariations(raw, context('synonyms'));

    assert.equal(result.variations.length, 5);
    assert.ok(result.variations.every((item) => item.spelling !== 'sleek'));
  });

  it('rejects duplicates and names already shown', () => {
    const raw = {
      variations: [variation('spotless'), variation('spotless'), variation('tidy')],
    };

    const result = sanitizeVariations(raw, context('synonyms', { previous: ['tidy'] }));

    assert.deepEqual(
      result.variations.map((item) => item.spelling),
      ['spotless']
    );
    assert.equal(result.rejected.length, 2);
    assert.match(result.rejected[0].reason, /duplicate/i);
    assert.match(result.rejected[1].reason, /earlier round/i);
  });

  it('rejects the working name and the original name', () => {
    const raw = { variations: [variation('clean')] };

    const result = sanitizeVariations(raw, context('synonyms'));

    assert.equal(result.variations.length, 0);
    assert.match(result.rejected[0].reason, /working name/i);
  });

  it('rejects spellings that carry an extension and reasons that are missing', () => {
    const raw = {
      variations: [variation('spotless.com'), { spelling: 'tidy', reason: '' }],
    };

    const result = sanitizeVariations(raw, context('synonyms'));

    assert.equal(result.variations.length, 0);
    assert.match(result.rejected[0].reason, /extension/i);
    assert.match(result.rejected[1].reason, /reason/i);
  });
});

describe('technique boundaries', () => {
  it('rejects an affix presented as a synonym', () => {
    const raw = { variations: [variation('getclean')] };

    const result = sanitizeVariations(raw, context('synonyms'));

    assert.equal(result.variations.length, 0);
    assert.match(result.rejected[0].reason, /prefix\/suffix/i);
  });

  it('accepts a real synonym', () => {
    const raw = { variations: [variation('spotless')] };

    const result = sanitizeVariations(raw, context('synonyms'));

    assert.equal(result.variations[0].spelling, 'spotless');
  });

  it('accepts only genuine rhymes', () => {
    const raw = { variations: [variation('mean'), variation('glean'), variation('green')] };

    const result = sanitizeVariations(raw, context('rhymes'));

    assert.deepEqual(
      result.variations.map((item) => item.spelling),
      ['mean', 'glean']
    );
    assert.match(result.rejected[0].reason, /rhyme/i);
  });

  it('accepts only readable affixes around the working name', () => {
    const raw = {
      variations: [variation('getclean'), variation('cleanable'), variation('spotless')],
    };

    const result = sanitizeVariations(raw, context('affixes'));

    assert.deepEqual(
      result.variations.map((item) => item.spelling),
      ['getclean', 'cleanable']
    );
    assert.equal(result.rejected.length, 1);
  });

  it('accepts only possessives that keep the working name', () => {
    const raw = {
      variations: [variation('myclean'), variation('yourclean'), variation('cleanmy')],
    };

    const result = sanitizeVariations(raw, context('possessives'));

    assert.deepEqual(
      result.variations.map((item) => item.spelling),
      ['myclean', 'yourclean']
    );
  });
});

describe('hyphens', () => {
  const phraseContext = (overrides: Partial<VariationContext> = {}) =>
    context('hyphens', { mode: 'phrase', workingName: 'clean ledger', ...overrides });

  it('is unavailable for a single word', () => {
    assert.equal(techniqueAvailable('hyphens', 'word'), false);
    assert.equal(techniqueAvailable('hyphens', 'phrase'), true);

    const result = sanitizeVariations({ variations: [variation('cle-an')] }, context('hyphens'));

    assert.equal(result.variations.length, 0);
    assert.match(result.rejected[0].reason, /single word/i);
  });

  it('accepts a hyphen on the word boundary of a phrase', () => {
    const result = sanitizeVariations({ variations: [variation('clean-ledger')] }, phraseContext());

    assert.equal(result.variations[0].spelling, 'clean-ledger');
  });

  it('rejects inserted letters, several hyphens and fragment splits', () => {
    const result = sanitizeVariations(
      {
        variations: [
          variation('clean-ledgers'),
          variation('clean-led-ger'),
          variation('cle-anledger'),
        ],
      },
      phraseContext()
    );

    assert.equal(result.variations.length, 0);
    assert.match(result.rejected[0].reason, /insert/i);
    assert.match(result.rejected[1].reason, /one hyphen/i);
    assert.match(result.rejected[2].reason, /word boundary/i);
  });
});

describe('phrases name the changed word', () => {
  const phraseContext = context('synonyms', { mode: 'phrase', workingName: 'clean ledger' });

  it('rejects a suggestion that does not say which word changed', () => {
    const result = sanitizeVariations({ variations: [variation('cleanbook')] }, phraseContext);

    assert.equal(result.variations.length, 0);
    assert.match(result.rejected[0].reason, /which word/i);
  });

  it('rejects a changed word that is not in the working name', () => {
    const result = sanitizeVariations(
      { variations: [variation('cleanbook', 'Ledger becomes book.', 'ledger')] },
      phraseContext
    );

    assert.equal(result.variations[0].changedWord, 'ledger');
    assert.equal(result.variations.length, 1);
  });

  it('rejects a changed word outside the phrase', () => {
    const result = sanitizeVariations(
      { variations: [variation('cleanbook', 'Swaps in a word.', 'invoice')] },
      phraseContext
    );

    assert.equal(result.variations.length, 0);
    assert.match(result.rejected[0].reason, /not part of the working name/i);
  });
});

describe('claim labels', () => {
  it('never uses unsupported quality verdicts', () => {
    const copy = [...Object.values(TECHNIQUE_LABELS), ...Object.values(TECHNIQUE_DESCRIPTIONS)]
      .join(' ')
      .toLowerCase();

    for (const banned of BANNED_CLAIM_LABELS) {
      assert.equal(copy.includes(banned), false, `copy must not contain "${banned}"`);
    }
  });
});
