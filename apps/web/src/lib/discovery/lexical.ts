// Independent lexical verification for names the model proposes.
//
// Rhymes and affixes used to be checked only for shape and sound, so a model
// could invent a spelling and pass. This module reads English entries from
// Wiktionary (Wikimedia Foundation, CC BY-SA 4.0) and decides whether a word is
// a lexical word rather than a symbol, abbreviation or obsolete form. The model
// is never asked to vouch for its own invention.
//
// The parser is shared so the Cloudflare trial Worker and any future server can
// use the same definition of "recognised word". Network access lives in the
// caller; this file only parses and reports honestly.

export const LEXICAL_SOURCE = {
  name: 'Wiktionary (Wikimedia Foundation)',
  url: 'https://en.wiktionary.org/',
  api: 'https://en.wiktionary.org/api/rest_v1/page/definition/',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://en.wiktionary.org/wiki/Wiktionary:Copyrights',
} as const;

export interface LexicalSense {
  partOfSpeech: string;
  definition: string;
}

export interface LexicalAnalysis {
  recognized: boolean;
  senses: LexicalSense[];
}

/** Parts of speech that make a term a lexical English word. */
const LEXICAL_PARTS = new Set([
  'adjective',
  'adverb',
  'article',
  'conjunction',
  'determiner',
  'interjection',
  'noun',
  'numeral',
  'particle',
  'preposition',
  'pronoun',
  'verb',
]);

/**
 * Definitions carrying these labels are not usable as an ordinary English
 * word for a brand: obsolete forms and abbreviations are exactly how invented
 * rhymes such as "grane" and "ly" would otherwise slip through.
 */
const DISQUALIFYING_DEFINITION =
  /\b(obsolete|archaic|dialectal|nonstandard|slang|abbreviation|initialism|acronym|roman numeral|iso 639|misspelling|eye dialect|letter|symbol)\b/i;

const ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Wiktionary's definition HTML is readable once tags and comments are gone. */
export function plainDefinition(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<link\b[^>]*>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsableDefinition(definition: string): boolean {
  if (!definition) return false;
  return !DISQUALIFYING_DEFINITION.test(definition);
}

/**
 * Parse the English section of Wiktionary's page-definition response.
 *
 * A missing page is an empty object and is reported as unrecognised. The caller
 * distinguishes that from a network or HTTP failure; this parser must not turn
 * an outage into "unknown word".
 */
export function parseLexicalResponse(payload: unknown): LexicalAnalysis {
  if (!payload || typeof payload !== 'object') return { recognized: false, senses: [] };

  const english = (payload as { en?: unknown }).en;
  if (!Array.isArray(english)) return { recognized: false, senses: [] };

  const senses: LexicalSense[] = [];

  for (const entry of english) {
    if (!entry || typeof entry !== 'object') continue;

    const record = entry as { partOfSpeech?: unknown; definitions?: unknown };
    const partOfSpeech = typeof record.partOfSpeech === 'string' ? record.partOfSpeech.trim() : '';
    if (!LEXICAL_PARTS.has(partOfSpeech.toLowerCase())) continue;
    if (!Array.isArray(record.definitions)) continue;

    for (const rawDefinition of record.definitions) {
      if (!rawDefinition || typeof rawDefinition !== 'object') continue;

      const definition =
        typeof (rawDefinition as { definition?: unknown }).definition === 'string'
          ? plainDefinition((rawDefinition as { definition: string }).definition)
          : '';
      if (!isUsableDefinition(definition)) continue;

      senses.push({
        partOfSpeech,
        definition: definition.slice(0, 280),
      });
    }
  }

  return { recognized: senses.length > 0, senses };
}
