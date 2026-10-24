import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkRequest, variationRequest } from './payloads.ts';
import { emptySession, withBrand, withTechnique, withWorkingName } from './session.ts';
import type { BrandContext } from './types.ts';

const brand: BrandContext = {
  mode: 'phrase',
  original: 'clean ledger',
  workingName: 'clean ledger',
  meaning: 'A tidy record of money owed.',
  meaningSource: 'Free Dictionary API',
  commentary: 'Bookkeeping that feels calm.',
  extensions: ['com', 'ai'],
};

const session = withTechnique(withBrand(emptySession(), brand), 'rhymes');

describe('brand context persistence', () => {
  it('carries the original, meaning, commentary and extensions into a round', () => {
    const request = variationRequest(session, 'rhymes');

    assert.ok(request);
    assert.equal(request.original, 'clean ledger');
    assert.equal(request.workingName, 'clean ledger');
    assert.equal(request.meaning, brand.meaning);
    assert.equal(request.meaningSource, brand.meaningSource);
    assert.equal(request.commentary, brand.commentary);
    assert.deepEqual(request.extensions, ['com', 'ai']);
  });

  it('keeps the original anchor when a suggestion becomes the working name', () => {
    const branched = withWorkingName(session, 'clean record');
    const request = variationRequest(branched, 'synonyms');

    assert.ok(request);
    assert.equal(request.original, 'clean ledger');
    assert.equal(request.workingName, 'clean record');
  });
});

describe('strategy selection', () => {
  it('sends only the technique the user chose', () => {
    const request = variationRequest(session, 'possessives');

    assert.ok(request);
    assert.equal(request.technique, 'possessives');

    const serialized = JSON.stringify(request);
    assert.equal(serialized.includes('synonyms'), false);
    assert.equal(serialized.includes('affixes'), false);
    assert.equal(serialized.includes('hyphens'), false);
  });

  it('returns nothing when no brand is established', () => {
    assert.equal(variationRequest(emptySession(), 'synonyms'), null);
  });
});

describe('checks stay scoped', () => {
  it('checks only the chosen spellings and selected extensions', () => {
    const request = checkRequest(session, ['cleanledger', 'cleanrecord']);

    assert.ok('domains' in request);
    assert.deepEqual(request.domains, [
      'cleanledger.com',
      'cleanledger.ai',
      'cleanrecord.com',
      'cleanrecord.ai',
    ]);
    assert.deepEqual(request.extensions, ['com', 'ai']);
  });

  it('refuses to check without a selected extension', () => {
    const bare = withBrand(emptySession(), { ...brand, extensions: [] });

    assert.ok('error' in checkRequest(bare, ['cleanledger']));
  });

  it('refuses an empty selection', () => {
    assert.ok('error' in checkRequest(session, []));
  });
});
