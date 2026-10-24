// The five exploration techniques and the boundaries each one must respect.
//
// This is the single source of truth for both the prompt sent to the model and
// the validation applied to its answer, so a technique cannot be described one
// way and checked another.
import type { Technique } from './types.ts';

export const TECHNIQUES: readonly Technique[] = [
  'synonyms',
  'rhymes',
  'affixes',
  'possessives',
  'hyphens',
];

export const TECHNIQUE_LABELS: Record<Technique, string> = {
  synonyms: 'Synonyms',
  rhymes: 'Rhymes',
  affixes: 'Prefixes and suffixes',
  possessives: 'Possessives',
  hyphens: 'Hyphens',
};

export const TECHNIQUE_DESCRIPTIONS: Record<Technique, string> = {
  synonyms: 'Words that mean what your chosen meaning says, not loose associations.',
  rhymes: 'Genuine rhymes of the working name.',
  affixes: 'Readable prefixes or suffixes around your working name.',
  possessives: 'my / your / our / his / her / their / its in front of your working name.',
  hyphens: 'A hyphen at a real word boundary in a multi-word name.',
};

export const POSSESSIVE_FORMS = ['my', 'your', 'our', 'his', 'her', 'their', 'its'] as const;

/** Technique rules quoted into the model prompt. */
export const TECHNIQUE_RULES: Record<Technique, string> = {
  synonyms:
    'Every suggestion must mean the selected meaning. Do not pad with alliteration, invented filler or unrelated words that merely sound similar.',
  rhymes:
    'Every suggestion must rhyme with a word of the working name. If a rhyme carries a weaker fit with the brand meaning, say so in its reason.',
  affixes:
    'Every suggestion must be the working name plus a readable, pronounceable prefix or suffix. Reject awkward or unreadable stacks of letters.',
  possessives:
    'Every suggestion must be one of my, your, our, his, her, their, its placed before the working name, and only where it reads naturally.',
  hyphens:
    'Only hyphenate a multi-word name at a real word boundary, replacing the space. Never split a single word into fragments.',
};

/** Hyphenation needs a word boundary, which only a multi-word name has. */
export function techniqueAvailable(technique: Technique, mode: 'word' | 'phrase'): boolean {
  if (technique === 'hyphens') return mode === 'phrase';
  return true;
}

/** Rhyme key: the last vowel cluster and everything after it. */
export function rhymeKey(word: string): string {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!letters) return '';

  const vowels = 'aeiouy';
  let lastVowel = -1;

  for (let index = letters.length - 1; index >= 0; index -= 1) {
    if (vowels.includes(letters[index])) {
      lastVowel = index;
      break;
    }
  }

  if (lastVowel < 0) return letters;

  let start = lastVowel;
  while (start > 0 && vowels.includes(letters[start - 1])) start -= 1;

  return letters.slice(start);
}

/** Candidate labels that describe a change without claiming a quality verdict. */
export const BANNED_CLAIM_LABELS = ['strong match', 'recommended', 'premium pick'] as const;
