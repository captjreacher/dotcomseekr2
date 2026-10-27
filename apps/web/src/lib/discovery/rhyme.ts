// Phonetic rime comparison for the rhymes technique.
//
// Rhyming is a property of sound, not spelling: "clean" rhymes with "green",
// "mean" and "machine" even though the endings are spelled differently, and
// "bough" does not rhyme with "cough" even though it looks like it should.
// A spelling-only key (last vowel cluster + letters) therefore rejects genuine
// rhymes and accepts false ones, so the validator compares a normalized
// sound-rime instead.
//
// The classifier is deliberately small: it only needs to decide whether two
// name-sized words share a final rime, not to render phonetics. It handles the
// common English rime spellings and carries a short exception list for words
// those rules get wrong. Every decision is checked in rhyme.test.ts.

/**
 * Whole words whose pronunciation breaks the spelling rules below.
 * Values are the sound rime, using the same upper-case vowel codes.
 */
const WORD_EXCEPTIONS: Record<string, string> = {
  // Vowel + silent e that is not the "magic e" long vowel.
  gone: 'AON',
  love: 'UHV',
  glove: 'UHV',
  dove: 'UHV',
  above: 'UHV',
  shove: 'UHV',
  move: 'OOV',
  prove: 'OOV',
  groove: 'OOV',
  one: 'UHN',
  done: 'UHN',
  none: 'UHN',
  son: 'UHN',
  ton: 'UHN',
  won: 'UHN',
  come: 'UHM',
  some: 'UHM',
  have: 'AV',
  give: 'IV',
  live: 'IV',
  // -i- pronounced /aɪ/ without a silent e.
  sign: 'AYN',
  align: 'AYN',
  design: 'AYN',
  assign: 'AYN',
  resign: 'AYN',
  climb: 'AYM',
  kind: 'AYND',
  find: 'AYND',
  mind: 'AYND',
  behind: 'AYND',
  blind: 'AYND',
  child: 'AYLD',
  wild: 'AYLD',
  mild: 'AYLD',
  // -ough, which has several different sounds.
  cough: 'OFF',
  rough: 'UFF',
  tough: 'UFF',
  enough: 'UFF',
  bough: 'AWN',
  through: 'OO',
  though: 'OH',
  // Other common irregular rimes.
  said: 'ED',
  again: 'EN',
  great: 'AYT',
  break: 'AYT',
  steak: 'AYT',
  heart: 'ART',
  heard: 'ERD',
  word: 'ERD',
  work: 'ERK',
  world: 'ERLD',
  // -ow pronounced /oʊ/ with a silent w, and the /aʊ/ family.
  own: 'OHN',
  now: 'AWN',
  how: 'AWN',
  cow: 'AWN',
  brow: 'AWN',
  plow: 'AWN',
  allow: 'AWN',
  down: 'AWN',
  town: 'AWN',
  brown: 'AWN',
  crown: 'AWN',
  drown: 'AWN',
  frown: 'AWN',
  gown: 'AWN',
  clown: 'AWN',
  // Words whose final -i- is /iː/.
  machine: 'EEN',
  marine: 'EEN',
  routine: 'EEN',
  magazine: 'EEN',
  cuisine: 'EEN',
  ravine: 'EEN',
};

const SHORT_VOWELS: Record<string, string> = {
  a: 'AE',
  e: 'EH',
  i: 'IH',
  o: 'AO',
  u: 'UH',
  y: 'AY',
};

const LONG_VOWELS: Record<string, string> = {
  a: 'AY',
  e: 'EE',
  i: 'AY',
  o: 'OH',
  u: 'OO',
  y: 'AY',
};

const VOWEL_DIGRAPHS: Record<string, string> = {
  ee: 'EE',
  ea: 'EE',
  ie: 'EE',
  ei: 'EE',
  ey: 'EE',
  oo: 'OO',
  ou: 'AW',
  ow: 'OH',
  oa: 'OH',
  oe: 'OH',
  ai: 'AY',
  ay: 'AY',
  au: 'AO',
  aw: 'AO',
  oi: 'OY',
  oy: 'OY',
  ue: 'OO',
  ui: 'OO',
  ew: 'OO',
  eu: 'OO',
  // Stand-ins for "igh" and "eigh" after the replacement pass.
  ii: 'AY',
  aa: 'AY',
};

function isVowelAt(text: string, index: number): boolean {
  const char = text[index];
  if (char === 'y') return index > 0;
  return 'aeiou'.includes(char);
}

function normalizeCoda(coda: string): string {
  return coda
    .replace(/ght$/, 't')
    .replace(/gh$/, '')
    .replace(/ck/g, 'k')
    .replace(/c/g, 'k')
    .replace(/ph/g, 'f')
    .replace(/mb$/, 'm')
    .replace(/mn$/, 'm')
    .replace(/([bcdfgjklmnprstvz])\1+/g, '$1');
}

/**
 * Sound rime: the final vowel sound and everything after it.
 *
 * Two different words whose rimes are equal rhyme, which is exactly the check
 * the rhymes technique needs.
 */
export function rhymeKey(word: string): string {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!letters) return '';

  const exception = WORD_EXCEPTIONS[letters];
  if (exception) return exception;

  let text = letters;
  let magicE = false;

  // A final e is silent after a consonant ("phone", "scene", "make") but not
  // after a vowel ("blue", "free"): dropping it lets the long-vowel rule run.
  if (text.length > 2 && text.endsWith('e') && !/[aeiouy]e$/.test(text)) {
    text = text.slice(0, -1);
    magicE = true;
  }

  text = text
    .replace(/eigh/g, 'aa')
    .replace(/igh/g, 'ii')
    .replace(/tch/g, 'ch')
    .replace(/dge/g, 'j')
    .replace(/ck/g, 'k')
    .replace(/ph/g, 'f')
    .replace(/qu/g, 'kw')
    .replace(/x/g, 'ks');

  let end = text.length - 1;
  while (end >= 0 && !isVowelAt(text, end)) end -= 1;
  if (end < 0) return text;

  let start = end;
  while (start > 0 && isVowelAt(text, start - 1)) start -= 1;

  const group = text.slice(start, end + 1);
  const coda = normalizeCoda(text.slice(end + 1));

  let nucleus: string;
  if (group.length === 1) {
    nucleus = (magicE ? LONG_VOWELS : SHORT_VOWELS)[group] ?? group;
  } else {
    nucleus = VOWEL_DIGRAPHS[group] ?? VOWEL_DIGRAPHS[group.slice(0, 2)] ?? group;
  }

  return `${nucleus}${coda.toUpperCase()}`;
}

/** Whether two different words genuinely rhyme. */
export function isRhyme(spelling: string, word: string): boolean {
  const left = spelling.toLowerCase().replace(/[^a-z]/g, '');
  const right = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!left || !right || left === right) return false;

  const leftKey = rhymeKey(left);
  return Boolean(leftKey) && leftKey === rhymeKey(right);
}
