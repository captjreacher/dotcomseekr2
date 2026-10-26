import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BANNED_CLAIM_LABELS,
  TECHNIQUE_DESCRIPTIONS,
  TECHNIQUE_LABELS,
  techniqueAvailable,
} from './techniques.ts';
import {
  lexicalTermsForRound,
  noResultsMessage,
  sanitizeVariations,
  type VariationContext,
} from './variations.ts';
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

  it('accepts rhymes by sound, not spelling', () => {
    const raw = {
      variations: [
        variation('mean'),
        variation('glean'),
        variation('green'),
        variation('machine'),
        variation('gleam'),
      ],
    };

    const result = sanitizeVariations(raw, context('rhymes'));

    assert.deepEqual(
      result.variations.map((item) => item.spelling),
      ['mean', 'glean', 'green', 'machine']
    );
    assert.match(result.rejected[0].reason, /rhyme/i);
  });

  it('accepts bound affixes but rejects a separate word attached to the name', () => {
    const raw = {
      variations: [
        variation('getclean'),
        variation('cleanable'),
        variation('reclean'),
        variation('spotless'),
      ],
    };

    const result = sanitizeVariations(
      raw,
      context('affixes', {
        recognised: new Set(['clean', 'get', 'cleanable', 'reclean', 'spotless']),
      })
    );

    assert.deepEqual(
      result.variations.map((item) => item.spelling),
      ['cleanable', 'reclean']
    );
    assert.match(result.rejected[0].reason, /separate word/i);
    assert.match(result.rejected[1].reason, /prefix or suffix/i);
  });

  it('rejects compounds made from separate words even when both parts are known', () => {
    const spellings = [
      'cranehire',
      'craneworks',
      'cranepro',
      'cranelift',
      'craneplus',
      'cranemax',
      'industrialscrane',
    ];
    const result = sanitizeVariations(
      { variations: spellings.map((spelling) => variation(spelling)) },
      context('affixes', {
        workingName: 'crane',
        original: 'crane',
        recognised: new Set([
          'crane',
          'hire',
          'works',
          'pro',
          'cranelift',
          'lift',
          'plus',
          'max',
          'industrials',
        ]),
      })
    );

    assert.equal(result.variations.length, 0);
    assert.equal(result.rejected.length, spellings.length);
    assert.ok(result.rejected.every((item) => /separate word/i.test(item.reason)));
  });

  it('keeps possessives out of affix rounds', () => {
    const result = sanitizeVariations(
      { variations: [variation('mycrane'), variation('craneable')] },
      context('affixes', {
        workingName: 'crane',
        original: 'crane',
        recognised: new Set(['crane', 'my', 'craneable']),
      })
    );

    assert.deepEqual(
      result.variations.map((item) => item.spelling),
      ['craneable']
    );
    assert.match(result.rejected[0].reason, /possessive/i);
  });

  it('accepts only possessives that keep the working name', () => {
    const raw = {
      variations: [
        variation('myclean'),
        variation('yourclean'),
        variation('ourclean'),
        variation('theirclean'),
        variation('cleanmy'),
      ],
    };

    const result = sanitizeVariations(raw, context('possessives'));

    assert.deepEqual(
      result.variations.map((item) => item.spelling),
      ['myclean', 'yourclean', 'ourclean', 'theirclean']
    );
  });

  it('rejects third-person possessives as awkward for a brand', () => {
    const result = sanitizeVariations(
      { variations: [variation('herswift'), variation('ourswift')] },
      context('possessives', { workingName: 'swift', original: 'swift' })
    );

    assert.deepEqual(
      result.variations.map((item) => item.spelling),
      ['ourswift']
    );
    assert.match(result.rejected[0].reason, /third-person/i);
  });

  it('rejects a rhyme that is not a recognised English word', () => {
    const result = sanitizeVariations(
      { variations: [variation('plane'), variation('train'), variation('grane')] },
      context('rhymes', {
        workingName: 'crane',
        original: 'crane',
        recognised: new Set(['plane', 'train']),
      })
    );

    assert.deepEqual(
      result.variations.map((item) => item.spelling),
      ['plane', 'train']
    );
    assert.match(result.rejected[0].reason, /recognised English word/i);
  });

  it('rejects a recognised rhyme that only states the sound', () => {
    const result = sanitizeVariations(
      { variations: [variation('commonround', 'round rhymes with ground.', 'ground')] },
      context('rhymes', {
        mode: 'phrase',
        workingName: 'common ground',
        original: 'common ground',
        meaning: 'shared agreement between people who disagree',
        commentary:
          'A mediation service for neighbours in disputes. Ground is figurative agreement, not soil.',
        recognised: new Set(['common', 'ground', 'round']),
      })
    );

    assert.equal(result.variations.length, 0);
    assert.match(result.rejected[0].reason, /fits the selected meaning/i);
  });

  it('accepts a recognised rhyme that explains its brand connection', () => {
    const result = sanitizeVariations(
      {
        variations: [
          variation(
            'commonround',
            'round rhymes with ground and suggests a shared cycle of agreement.',
            'ground'
          ),
        ],
      },
      context('rhymes', {
        mode: 'phrase',
        workingName: 'common ground',
        original: 'common ground',
        meaning: 'shared agreement between people who disagree',
        commentary:
          'A mediation service for neighbours in disputes. Ground is figurative agreement, not soil.',
        recognised: new Set(['common', 'ground', 'round']),
      })
    );

    assert.equal(result.variations[0].spelling, 'commonround');
  });

  it('rejects an invented affix but allows a productive ending', () => {
    const result = sanitizeVariations(
      {
        variations: [
          variation('swiftly'),
          variation('swiftness'),
          variation('swiftier'),
          variation('swiftify'),
          variation('swiftish'),
        ],
      },
      context('affixes', {
        workingName: 'swift',
        original: 'swift',
        recognised: new Set(['swiftly', 'swiftness']),
      })
    );

    assert.deepEqual(
      result.variations.map((item) => item.spelling),
      ['swiftly', 'swiftness', 'swiftify', 'swiftish']
    );
    assert.match(result.rejected[0].reason, /grammatical ending/i);
  });

  it('rejects an affix that negates the whole phrase', () => {
    const result = sanitizeVariations(
      { variations: [variation('uncommonground', 'Adds un- to common.', 'common')] },
      context('affixes', {
        mode: 'phrase',
        workingName: 'common ground',
        original: 'common ground',
        recognised: new Set(['common', 'ground', 'uncommon']),
      })
    );

    assert.equal(result.variations.length, 0);
    assert.match(result.rejected[0].reason, /negates/i);
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

  it('records the changed word on an accepted phrase suggestion', () => {
    const result = sanitizeVariations(
      { variations: [variation('cleanbook', 'Ledger becomes book.', 'ledger')] },
      phraseContext
    );

    assert.equal(result.variations[0].changedWord, 'ledger');
    assert.equal(result.variations.length, 1);
  });

  it('rejects a phrase suggestion that drops or reorders the other words', () => {
    const result = sanitizeVariations(
      {
        variations: [
          variation('book', 'Ledger becomes book.', 'ledger'),
          variation('ledgerclean', 'Swaps the words.', 'clean'),
        ],
      },
      phraseContext
    );

    assert.equal(result.variations.length, 0);
    assert.match(result.rejected[0].reason, /other words/i);
    assert.match(result.rejected[1].reason, /other words/i);
  });

  it('rejects the unchanged phrase presented as a change', () => {
    const result = sanitizeVariations(
      { variations: [variation('cleanledger', 'Same name.', 'ledger')] },
      phraseContext
    );

    assert.match(result.rejected[0].reason, /working name/i);
  });

  it('rejects an affix presented as a phrase synonym', () => {
    const result = sanitizeVariations(
      { variations: [variation('cleanledgerly', 'Adds a suffix.', 'ledger')] },
      phraseContext
    );

    assert.equal(result.variations.length, 0);
    assert.match(result.rejected[0].reason, /prefix\/suffix/i);
  });

  it('rhymes the word the answer says it changed', () => {
    const rhymeContext = context('rhymes', { mode: 'phrase', workingName: 'clean ledger' });
    const accepted = sanitizeVariations(
      { variations: [variation('cleanhedger', 'Ledger becomes hedger.', 'ledger')] },
      rhymeContext
    );
    const rejected = sanitizeVariations(
      { variations: [variation('cleanleader', 'Ledger becomes leader.', 'ledger')] },
      rhymeContext
    );

    assert.equal(accepted.variations.length, 1);
    assert.match(rejected.rejected[0].reason, /genuine rhyme/i);
    assert.match(rejected.rejected[0].reason, /ledger/);
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

describe('phrases without a replaced word', () => {
  it('accepts a possessive before the whole phrase without a changed word', () => {
    const result = sanitizeVariations(
      { variations: [variation('mycleanledger')] },
      context('possessives', { mode: 'phrase', workingName: 'clean ledger' })
    );

    assert.equal(result.variations[0].spelling, 'mycleanledger');
  });

  it('accepts an affix on the named word of a phrase', () => {
    const result = sanitizeVariations(
      { variations: [variation('cleanledgerly', 'Adds a suffix to ledger.', 'ledger')] },
      context('affixes', { mode: 'phrase', workingName: 'clean ledger' })
    );

    assert.equal(result.variations[0].spelling, 'cleanledgerly');
  });
});

describe('lexical term extraction', () => {
  it('checks the replaced word of a phrase rhyme, not the joined phrase', () => {
    const terms = lexicalTermsForRound(
      { variations: [variation('blueflorit', 'Rhymes with orbit.', 'orbit')] },
      context('rhymes', { mode: 'phrase', workingName: 'blue orbit' })
    );

    assert.deepEqual(terms, ['florit']);
  });

  it('checks both the spelling and the added affix piece', () => {
    const terms = lexicalTermsForRound(
      { variations: [variation('blueneoorbit', 'Adds neo-.', 'orbit')] },
      context('affixes', { mode: 'phrase', workingName: 'blue orbit' })
    );

    assert.ok(terms.includes('blueneoorbit'));
    assert.ok(terms.includes('neoorbit'));
    assert.ok(terms.includes('neo'));
  });

  it('offers a clear reason for an empty round', () => {
    assert.match(noResultsMessage('rhymes'), /recognised English rhyme/i);
    assert.match(noResultsMessage('affixes'), /linguistic prefix or suffix/i);
  });
});

describe('claim labels', () => {
  it('rejects a quality verdict inside a reason', () => {
    const result = sanitizeVariations(
      { variations: [variation('spotless', 'A strong match for your brand.')] },
      context('synonyms')
    );

    assert.equal(result.variations.length, 0);
    assert.match(result.rejected[0].reason, /quality verdict/i);
  });

  it('rejects a suggestion whose own reason admits it does not fit', () => {
    const result = sanitizeVariations(
      {
        variations: [
          variation(
            'commonwound',
            'Rhymes with ground, but has a very negative connotation that does not fit the brand commentary.',
            'ground'
          ),
        ],
      },
      context('rhymes', {
        mode: 'phrase',
        workingName: 'common ground',
        original: 'common ground',
        recognised: new Set(['common', 'ground', 'wound']),
      })
    );

    assert.equal(result.variations.length, 0);
    assert.match(result.rejected[0].reason, /does not fit/i);
  });

  it('never uses unsupported quality verdicts', () => {
    const copy = [...Object.values(TECHNIQUE_LABELS), ...Object.values(TECHNIQUE_DESCRIPTIONS)]
      .join(' ')
      .toLowerCase();

    for (const banned of BANNED_CLAIM_LABELS) {
      assert.equal(copy.includes(banned), false, `copy must not contain "${banned}"`);
    }
  });
});
