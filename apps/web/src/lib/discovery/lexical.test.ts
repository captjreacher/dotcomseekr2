import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseLexicalResponse, plainDefinition } from './lexical.ts';

function entry(partOfSpeech: string, definitions: string[]) {
  return {
    partOfSpeech,
    definitions: definitions.map((definition) => ({ definition })),
  };
}

describe('Wiktionary lexical verification', () => {
  it('accepts a current English word with a lexical part of speech', () => {
    const result = parseLexicalResponse({
      en: [
        entry('Adjective', [
          '<span class="Latn">Free from that which is useless or injurious.</span>',
        ]),
        entry('Verb', ['<a rel="mw:WikiLink" href="/wiki/clean">To remove dirt.</a>']),
      ],
    });

    assert.equal(result.recognized, true);
    assert.ok(result.senses.some((sense) => sense.definition.includes('remove dirt')));
  });

  it('rejects an obsolete-only spelling such as grane', () => {
    const result = parseLexicalResponse({
      en: [
        entry('Verb', [
          '<span class="form-of-definition"><a href="/wiki/Appendix:Glossary#obsolete">Obsolete</a> form of <a href="/wiki/groan">groan</a>.</span>',
        ]),
        entry('Noun', [
          '<span class="form-of-definition"><a href="/wiki/Appendix:Glossary#obsolete">Obsolete</a> spelling of <a href="/wiki/grain">grain</a>.</span>',
        ]),
      ],
    });

    assert.equal(result.recognized, false);
    assert.equal(result.senses.length, 0);
  });

  it('rejects abbreviations and symbols as ordinary words', () => {
    assert.equal(
      parseLexicalResponse({
        en: [
          entry('Noun', [
            '<a href="/wiki/Appendix:Glossary#abbreviation">Abbreviation</a> of <a href="/wiki/light_year">light year</a>.',
          ]),
          entry('Verb', [
            '<a href="/wiki/Appendix:Glossary#obsolete">Obsolete</a> form of <a href="/wiki/lie">lie</a>.',
          ]),
        ],
      }).recognized,
      false
    );

    assert.equal(
      parseLexicalResponse({
        en: [entry('Symbol', ['The Roman numeral nine.'])],
      }).recognized,
      false
    );
  });

  it('reports a missing English entry as unrecognised rather than throwing', () => {
    assert.deepEqual(parseLexicalResponse({ en: [] }), { recognized: false, senses: [] });
    assert.deepEqual(parseLexicalResponse({}), { recognized: false, senses: [] });
  });

  it('strips HTML, comments and entities from definitions', () => {
    assert.equal(
      plainDefinition(
        '<!-- {{lb|en|obsolete}}? --><span class="Latn">A &amp; B</span><link rel="x"><b>now</b>.'
      ),
      'A & B now .'
    );
  });
});
