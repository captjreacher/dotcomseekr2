import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DICTIONARY_SOURCE, lookupDefinitions } from './dictionary.ts';

function fetchStub(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
}

const payload = [
  {
    word: 'clean',
    meanings: [
      {
        partOfSpeech: 'adjective',
        definitions: [
          { definition: 'Free from dirt, marks, or stains.' },
          { definition: 'Morally uncontaminated.' },
        ],
      },
      {
        partOfSpeech: 'verb',
        definitions: [{ definition: 'Make clean.' }],
      },
    ],
  },
];

describe('dictionary lookup', () => {
  it('returns selectable definitions with an attributable source', async () => {
    const lookup = await lookupDefinitions('clean', { fetchImpl: fetchStub(200, payload) });

    assert.equal(lookup.noEntry, false);
    assert.equal(lookup.senses.length, 3);
    assert.equal(lookup.senses[0].partOfSpeech, 'adjective');
    assert.equal(lookup.source?.name, DICTIONARY_SOURCE.name);
    assert.match(lookup.source?.detail ?? '', /Wiktionary/);
  });

  it('reports a phrase with no entry instead of inventing one', async () => {
    const lookup = await lookupDefinitions('clean ledger', {
      fetchImpl: fetchStub(404, { title: 'No Definitions Found' }),
    });

    assert.equal(lookup.noEntry, true);
    assert.equal(lookup.senses.length, 0);
    assert.equal(lookup.source, null);
    assert.equal(lookup.error, undefined);
  });

  it('reports an unreachable dictionary without fabricating a definition', async () => {
    const failing = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const lookup = await lookupDefinitions('clean', { fetchImpl: failing });

    assert.equal(lookup.noEntry, true);
    assert.equal(lookup.senses.length, 0);
    assert.match(lookup.error ?? '', /describe the meaning yourself/i);
  });

  it('caps the number of definitions', async () => {
    const many = [
      {
        word: 'clean',
        meanings: [
          {
            partOfSpeech: 'adjective',
            definitions: Array.from({ length: 20 }, (_, index) => ({
              definition: `Definition number ${index}.`,
            })),
          },
        ],
      },
    ];

    const lookup = await lookupDefinitions('clean', { fetchImpl: fetchStub(200, many) });

    assert.equal(lookup.senses.length, 8);
  });
});
