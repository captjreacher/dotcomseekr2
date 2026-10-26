// The five exploration techniques and the boundaries each one must respect.
//
// This is the single source of truth for both the prompt sent to the model and
// the validation applied to its answer, so a technique cannot be described one
// way and checked another.
import type { Technique } from './types.ts';

export { isRhyme, rhymeKey } from './rhyme.ts';

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
  affixes: 'Bound linguistic prefixes or suffixes, not extra words.',
  possessives: 'my / your / our / their in front of your working name.',
  hyphens: 'A hyphen at a real word boundary in a multi-word name.',
};

export const POSSESSIVE_FORMS = ['my', 'your', 'our', 'their'] as const;

/** Third-person possessives read like a sentence fragment in a brand name. */
export const REJECTED_POSSESSIVE_FORMS = ['his', 'her', 'its'] as const;

/** Technique rules quoted into the model prompt. */
export const TECHNIQUE_RULES: Record<Technique, string> = {
  synonyms:
    'Every suggestion must mean the selected meaning. Do not pad with alliteration, invented filler or unrelated words that merely sound similar.',
  rhymes:
    'Every suggestion must be a recognised English word that rhymes in sound, not spelling, with a word of the working name: "green" and "machine" rhyme with "clean". Never invent a spelling, use an obsolete form, or offer a lookalike that sounds different. If a rhyme only fits a different sense of the meaning, do not offer it.',
  affixes:
    'Every suggestion must add a bound linguistic prefix or suffix to the working name, such as re-, -able, -ness, -ish or -ify. A separate word is not an affix: cranehire, craneworks and cranepro are compounds, not affix suggestions. Reject letter stacks, grammatical endings that do not form a real word, and additions that negate the working name (un-, non-, anti-, dis-, -less). Return fewer or none when no genuine affix fits.',
  possessives:
    'Every suggestion must be one of my, your, our or their placed before the working name. His, her and its are not allowed because they read awkwardly for a brand.',
  hyphens:
    'Only hyphenate a multi-word name at a real word boundary, replacing the space. Never split a single word into fragments.',
};

/** Hyphenation needs a word boundary, which only a multi-word name has. */
export function techniqueAvailable(technique: Technique, mode: 'word' | 'phrase'): boolean {
  if (technique === 'hyphens') return mode === 'phrase';
  return true;
}

/** Candidate labels that describe a change without claiming a quality verdict. */
export const BANNED_CLAIM_LABELS = ['strong match', 'recommended', 'premium pick'] as const;
