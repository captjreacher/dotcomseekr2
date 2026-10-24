import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DICTIONARY_SOURCE, lookupDefinitions } from './dictionary.ts';

const functionsUrl = 'https://example.test/functions/v1';

function fetchStub(payload: unknown, status = 200, capture?: { url?: string; body?: unknown }) {
  return (async (url: string, init?: RequestInit) => {
    if (capture) {
      capture.url = url;
      capture.body = init?.body ? JSON.parse(String(init.body)) : null;
    }
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('dictionary lookup', () => {
  it('calls the discovery function and returns attributed definitions', async () => {
    const capture: { url?: string; body?: unknown } = {};
    const lookup = await lookupDefinitions('clean', {
      functionsUrl,
      fetchImpl: fetchStub(
        {
          term: 'clean',
          senses: [
            { partOfSpeech: 'adjective', definition: 'Free from dirt, marks, or stains.' },
            { partOfSpeech: 'verb', definition: 'Make clean.' },
          ],
          source: { name: DICTIONARY_SOURCE.name },
          noEntry: false,
        },
        200,
        capture
      ),
    });

    assert.equal(capture.url, `${functionsUrl}/dotcomseekr-discovery`);
    assert.deepEqual(capture.body, { action: 'definitions', term: 'clean' });
    assert.equal(lookup.noEntry, false);
    assert.equal(lookup.senses.length, 2);
    assert.equal(lookup.senses[0].partOfSpeech, 'adjective');
    assert.equal(lookup.source?.name, DICTIONARY_SOURCE.name);
    assert.match(lookup.source?.detail ?? '', /Wikimedia/);
  });

  it('reports a phrase with no entry instead of inventing one', async () => {
    const lookup = await lookupDefinitions('clean ledger', {
      functionsUrl,
      fetchImpl: fetchStub({ term: 'clean ledger', senses: [], source: null, noEntry: true }),
    });

    assert.equal(lookup.noEntry, true);
    assert.equal(lookup.senses.length, 0);
    assert.equal(lookup.source, null);
  });

  it('passes through a dictionary error without fabricating a definition', async () => {
    const lookup = await lookupDefinitions('clean', {
      functionsUrl,
      fetchImpl: fetchStub({
        term: 'clean',
        senses: [],
        noEntry: true,
        error: 'The dictionary could not be reached. You can describe the meaning yourself.',
      }),
    });

    assert.equal(lookup.noEntry, true);
    assert.match(lookup.error ?? '', /describe the meaning yourself/i);
  });

  it('reports an unreachable proxy without fabricating a definition', async () => {
    const failing = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const lookup = await lookupDefinitions('clean', { functionsUrl, fetchImpl: failing });

    assert.equal(lookup.noEntry, true);
    assert.match(lookup.error ?? '', /describe the meaning yourself/i);
  });

  it('reports a missing endpoint configuration', async () => {
    const lookup = await lookupDefinitions('clean', { functionsUrl: '' });

    assert.equal(lookup.noEntry, true);
    assert.match(lookup.error ?? '', /not configured/i);
  });

  it('caps the number of definitions', async () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      partOfSpeech: 'noun',
      definition: `Definition number ${index}.`,
    }));

    const lookup = await lookupDefinitions('clean', {
      functionsUrl,
      fetchImpl: fetchStub({ senses: many, noEntry: false }),
    });

    assert.equal(lookup.senses.length, 8);
  });
});
