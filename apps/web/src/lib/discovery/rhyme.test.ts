import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isRhyme, rhymeKey } from './rhyme.ts';

describe('sound rimes', () => {
  it('accepts rhymes that are spelled differently', () => {
    for (const word of ['mean', 'glean', 'green', 'scene', 'spleen', 'machine', 'marine']) {
      assert.equal(isRhyme(word, 'clean'), true, `${word} should rhyme with clean`);
    }
  });

  it('rejects spelling lookalikes that sound different', () => {
    for (const word of ['gleam', 'clan', 'clam', 'cleaner']) {
      assert.equal(isRhyme(word, 'clean'), false, `${word} should not rhyme with clean`);
    }
  });

  it('handles silent-e rimes', () => {
    for (const word of ['loan', 'bone', 'clone', 'alone', 'own']) {
      assert.equal(isRhyme(word, 'phone'), true, `${word} should rhyme with phone`);
    }

    for (const word of ['gone', 'done', 'none']) {
      assert.equal(isRhyme(word, 'phone'), false, `${word} should not rhyme with phone`);
    }
  });

  it('keeps the -ough sounds apart', () => {
    assert.equal(isRhyme('bough', 'cough'), false);
    assert.equal(isRhyme('tough', 'rough'), true);
    assert.equal(isRhyme('through', 'blue'), true);
  });

  it('accepts long-i rimes without a silent e', () => {
    assert.equal(isRhyme('sign', 'line'), true);
    assert.equal(isRhyme('design', 'shine'), true);
    assert.equal(isRhyme('kind', 'find'), true);
  });

  it('never treats a word as its own rhyme', () => {
    assert.equal(isRhyme('clean', 'clean'), false);
    assert.equal(rhymeKey('clean'), 'EEN');
  });

  it('ignores case and punctuation', () => {
    assert.equal(isRhyme('Green', 'clean.'), true);
  });

  it('rejects unrelated endings', () => {
    assert.equal(isRhyme('spotless', 'clean'), false);
    assert.equal(isRhyme('', 'clean'), false);
  });
});
