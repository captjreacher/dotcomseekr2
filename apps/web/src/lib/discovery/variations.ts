// Validation for model-proposed name variations.
//
// The model is untrusted: it can return the wrong technique, the original name,
// filler, six suggestions where five were allowed, a hyphen in the middle of a
// syllable, or a phrase suggestion that quietly drops one of the user's words.
// Every answer is validated here, on the server before it is returned and again
// in the browser before it is rendered, using the same rules.
import { MAX_VARIATIONS_PER_ROUND, isValidLabel, joinLabel } from './domains.ts';
import { isRhyme } from './rhyme.ts';
import { BANNED_CLAIM_LABELS, POSSESSIVE_FORMS, REJECTED_POSSESSIVE_FORMS } from './techniques.ts';
import type { DiscoveryMode, RejectedVariation, Technique, Variation } from './types.ts';

export interface VariationContext {
  technique: Technique;
  mode: DiscoveryMode;
  /** The name this round explores. */
  workingName: string;
  /** The user's original brand input, which is never replaced implicitly. */
  original: string;
  /** Spellings already shown in earlier rounds, normalized. */
  previous: readonly string[];
  /** Selected brand meaning; used to judge whether a rhyme is relevant. */
  meaning?: string;
  /** Brand commentary; used with the meaning to judge rhyme relevance. */
  commentary?: string;
  /**
   * Words confirmed by an independent lexical source. Undefined means the
   * caller has not run that check; the browser uses this when revalidating a
   * response the server already verified.
   */
  recognised?: ReadonlySet<string>;
}

export interface SanitizedVariations {
  variations: Variation[];
  rejected: RejectedVariation[];
}

const MAX_REASON_LENGTH = 200;
const MAX_SPELLING_LENGTH = 40;
const MIN_HYPHEN_SIDE = 3;

/**
 * Bound linguistic affixes. A compound made from a separate word ("crane" +
 * "hire") is not an affix, even when both parts are dictionary words. This is a
 * curated morphological allowlist, not a blacklist of model guesses.
 */
const LINGUISTIC_AFFIXES = new Set([
  // Suffixes
  'able',
  'al',
  'ance',
  'dom',
  'ed',
  'en',
  'ence',
  'er',
  'ery',
  'ese',
  'esque',
  'est',
  'ful',
  'fy',
  'hood',
  'ian',
  'ic',
  'ical',
  'ied',
  'ier',
  'ies',
  'ify',
  'ing',
  'ion',
  'ish',
  'ism',
  'ist',
  'ity',
  'ive',
  'ize',
  'less',
  'ly',
  'ment',
  'ness',
  'ology',
  'ous',
  'ship',
  's',
  'ward',
  'wise',
  // Prefixes
  'anti',
  'bi',
  'co',
  'de',
  'dis',
  'ex',
  'extra',
  'hyper',
  'inter',
  'intra',
  'macro',
  'micro',
  'mid',
  'mini',
  'mis',
  'mono',
  'multi',
  'non',
  'over',
  'post',
  'pre',
  're',
  'semi',
  'sub',
  'super',
  'trans',
  'tri',
  'ultra',
  'un',
  'under',
]);

/** Endings that must produce a real whole word, not just an invented one. */
const GRAMMATICAL_SUFFIXES = new Set([
  'ed',
  'er',
  'es',
  'est',
  'ied',
  'ier',
  'ies',
  'ing',
  'ly',
  's',
]);

/**
 * Prefixes that reverse the meaning of the word they attach to. They are
 * rejected unless the whole result is a recognised word ("uncommon" is fine;
 * "uncommonground" is not). This is a small grammatical rule, not a blacklist.
 */
const NEGATING_PREFIXES = new Set([
  'anti',
  'dis',
  'il',
  'im',
  'in',
  'ir',
  'mal',
  'mis',
  'non',
  'un',
]);
const NEGATING_SUFFIXES = new Set(['less']);

/**
 * Validate and cap a raw model payload.
 *
 * At most {@link MAX_VARIATIONS_PER_ROUND} suggestions survive a round; anything
 * off-technique, duplicated, already shown, or malformed is rejected with a
 * reason rather than silently dropped, so the UI can explain a thin round.
 * A thin round stays thin: nothing is padded to reach five.
 */
export function sanitizeVariations(raw: unknown, context: VariationContext): SanitizedVariations {
  const accepted: Variation[] = [];
  const rejected: RejectedVariation[] = [];
  const seen = new Set<string>();

  const candidates =
    raw && typeof raw === 'object' && Array.isArray((raw as { variations?: unknown }).variations)
      ? ((raw as { variations: unknown[] }).variations as unknown[])
      : [];

  for (const candidate of candidates) {
    if (accepted.length >= MAX_VARIATIONS_PER_ROUND) break;

    const reason = candidateReason(candidate, context, seen);

    if (reason) {
      const value =
        candidate && typeof candidate === 'object'
          ? String((candidate as { spelling?: unknown }).spelling ?? '').trim()
          : '';
      rejected.push({ value, reason });
      continue;
    }

    const variation = normalizeCandidate(candidate as Record<string, unknown>);
    accepted.push(variation);
    seen.add(variation.spelling);
  }

  return { variations: accepted, rejected };
}

/**
 * Terms an independent dictionary needs to see for this round.
 *
 * Rhymes are checked on the word that replaces or modifies the anchor, never on
 * the whole joined domain phrase. Affixes need both the resulting spelling and
 * the added piece, because either may be the recognised word.
 */
export function lexicalTermsForRound(raw: unknown, context: VariationContext): string[] {
  const candidates =
    raw && typeof raw === 'object' && Array.isArray((raw as { variations?: unknown }).variations)
      ? ((raw as { variations: unknown[] }).variations as unknown[])
      : [];

  const anchor = joinLabel(context.workingName);
  if (!anchor) return [];

  const tokens = phraseTokens(context.workingName);
  const terms = new Set<string>();

  const add = (value: string) => {
    const term = value.trim().toLowerCase();
    if (/^[a-z]{1,40}$/.test(term)) terms.add(term);
  };

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;

    const record = candidate as Record<string, unknown>;
    const spelling =
      typeof record.spelling === 'string' ? record.spelling.trim().toLowerCase() : '';
    if (!spelling) continue;

    const changedWord =
      typeof record.changedWord === 'string'
        ? record.changedWord.trim().toLowerCase()
        : typeof record.changed_word === 'string'
          ? (record.changed_word as string).trim().toLowerCase()
          : '';

    if (context.technique === 'rhymes') {
      if (context.mode === 'word') {
        add(spelling);
        continue;
      }

      const slot = phraseSlot(spelling, tokens, changedWord);
      if (!('error' in slot)) add(slot.value);
      continue;
    }

    if (context.technique === 'affixes') {
      if (context.mode === 'word') {
        addAffixTerms(terms, spelling, anchor);
        continue;
      }

      const slot = phraseSlot(spelling, tokens, changedWord);
      if ('error' in slot) continue;

      add(spelling);
      addAffixTerms(terms, slot.value, changedWord);
    }
  }

  return [...terms].slice(0, 24);
}

/** A short, explicit explanation for a genuinely empty round. */
export function noResultsMessage(technique: Technique): string {
  switch (technique) {
    case 'rhymes':
      return 'No suggestion was a recognised English rhyme for this round. A thin round is better than invented words; try another technique.';
    case 'affixes':
      return 'No suggestion used a bound linguistic prefix or suffix that fits this brand. A separate word is not an affix; try another technique, or refine the meaning and commentary.';
    case 'possessives':
      return 'No possessive form read naturally for this brand. Try another technique.';
    case 'synonyms':
      return 'No suggestion stayed close enough to the selected meaning. Try another technique, or refine the meaning and commentary.';
    case 'hyphens':
      return 'No hyphenation respected the word boundary. Try another technique.';
    default:
      return 'No suggestion met this round’s rules. Try another technique.';
  }
}

function normalizeCandidate(candidate: Record<string, unknown>): Variation {
  const variation: Variation = {
    spelling: String(candidate.spelling).trim().toLowerCase(),
    reason: String(candidate.reason).trim(),
  };

  const changedWord = candidate.changedWord ?? candidate.changed_word;
  if (typeof changedWord === 'string' && changedWord.trim()) {
    variation.changedWord = changedWord.trim().toLowerCase();
  }

  return variation;
}

function candidateReason(
  candidate: unknown,
  context: VariationContext,
  seen: Set<string>
): string | null {
  if (!candidate || typeof candidate !== 'object') return 'Not a usable suggestion.';

  const record = candidate as Record<string, unknown>;
  const spelling = typeof record.spelling === 'string' ? record.spelling.trim().toLowerCase() : '';
  const reason = typeof record.reason === 'string' ? record.reason.trim() : '';

  if (!spelling) return 'Missing a spelling.';
  if (spelling.includes('.')) return 'Spellings must not include an extension.';
  if (spelling.length > MAX_SPELLING_LENGTH) return 'Too long to read as a name.';
  if (!isValidLabel(spelling)) return 'Not a valid domain label.';
  if (!reason) return 'No reason given.';
  if (reason.length > MAX_REASON_LENGTH) return 'Reason is too long.';
  if (containsClaimLabel(reason)) return 'Do not claim a quality verdict; give a factual reason.';
  if (admitsMisfit(reason)) {
    return 'The reason says this does not fit the brand; choose a suggestion that does.';
  }

  const anchor = joinLabel(context.workingName);
  if (!anchor) return 'The working name is not a valid domain label.';
  if (spelling === anchor) return 'That is the working name itself.';
  if (spelling === joinLabel(context.original)) return 'That is the original name itself.';
  if (seen.has(spelling)) return 'Duplicate suggestion.';
  if (context.previous.map((value) => value.toLowerCase()).includes(spelling)) {
    return 'Already suggested in an earlier round.';
  }

  return techniqueReason(spelling, record, context, anchor);
}

function containsClaimLabel(reason: string): boolean {
  const value = reason.toLowerCase();
  return BANNED_CLAIM_LABELS.some((label) => value.includes(label));
}

/**
 * A reason that admits a poor fit is evidence against the suggestion. This is
 * not a list of bad words; it catches the model contradicting its own answer.
 */
function admitsMisfit(reason: string): boolean {
  return /does not fit|doesn't fit|negative connotation|contradicts the|contradict the|not ideal|weak fit|unrelated|different meaning|different sense|not related|poor fit|off-brand|off brand|too negative/i.test(
    reason
  );
}

function techniqueReason(
  spelling: string,
  record: Record<string, unknown>,
  context: VariationContext,
  anchor: string
): string | null {
  const changedWord =
    typeof record.changedWord === 'string'
      ? record.changedWord.trim().toLowerCase()
      : typeof record.changed_word === 'string'
        ? (record.changed_word as string).trim().toLowerCase()
        : '';
  const reason = typeof record.reason === 'string' ? record.reason : '';

  const tokens = phraseTokens(context.workingName);
  const isPhrase = context.mode === 'phrase';

  // Synonyms, rhymes and affixes change exactly one word of a phrase, so the
  // answer has to say which one. Possessives modify the whole name and hyphens
  // only join it, so they do not need a changed word.
  if (isPhrase && ['synonyms', 'rhymes', 'affixes'].includes(context.technique)) {
    if (!changedWord) return 'Say which word this replaces or modifies.';
    if (!tokens.includes(changedWord)) return 'The changed word is not part of the working name.';
  }

  switch (context.technique) {
    case 'synonyms': {
      if (isAffixedTo(spelling, anchor)) {
        return 'That is a prefix/suffix variation, not a synonym.';
      }
      if (!isPhrase) return null;

      const slot = phraseSlot(spelling, tokens, changedWord);
      if ('error' in slot) return slot.error;
      if (!/^[a-z]+$/.test(slot.value))
        return 'A synonym replaces one word with one readable word.';
      if (isAffixedTo(slot.value, changedWord)) {
        return 'That is a prefix/suffix variation, not a synonym.';
      }
      if (POSSESSIVE_FORMS.some((form) => slot.value === `${form}${changedWord}`)) {
        return 'That is a possessive, not a synonym.';
      }
      return null;
    }
    case 'rhymes': {
      if (!isPhrase) {
        const rhyme = isRhyme(spelling, anchor) ? null : 'Not a genuine rhyme of the working name.';
        return rhyme ?? wordReason(spelling, context) ?? rhymeContextReason(reason, context);
      }

      const slot = phraseSlot(spelling, tokens, changedWord);
      if ('error' in slot) return slot.error;
      if (!/^[a-z]+$/.test(slot.value)) return 'A rhyme replaces one word with one readable word.';
      if (!isRhyme(slot.value, changedWord)) return `Not a genuine rhyme of “${changedWord}”.`;

      return wordReason(slot.value, context) ?? rhymeContextReason(reason, context);
    }
    case 'affixes': {
      if (startsWithPossessive(spelling, anchor)) {
        return 'That is a possessive, not a prefix or suffix.';
      }

      if (!isPhrase) {
        if (!affixParts(spelling, anchor)) {
          return 'Must be the working name with a readable prefix or suffix.';
        }
        return affixReason(spelling, spelling, anchor, context);
      }

      const slot = phraseSlot(spelling, tokens, changedWord);
      if ('error' in slot) return slot.error;
      if (!/^[a-z]+$/.test(slot.value)) {
        return 'Put the prefix or suffix on the word it modifies.';
      }
      if (startsWithPossessive(slot.value, changedWord)) {
        return 'That is a possessive, not a prefix or suffix.';
      }
      if (!affixParts(slot.value, changedWord)) {
        return 'Must be one word of the working name with a readable prefix or suffix.';
      }

      return affixReason(slot.value, spelling, changedWord, context);
    }
    case 'possessives': {
      const possessive = POSSESSIVE_FORMS.find((form) => spelling === `${form}${anchor}`);
      if (possessive) return null;

      if (REJECTED_POSSESSIVE_FORMS.some((form) => spelling === `${form}${anchor}`)) {
        return 'Third-person possessives read awkwardly for a brand; use my, your, our or their.';
      }

      return 'Must be a possessive form placed before the working name.';
    }
    case 'hyphens': {
      return hyphenReason(spelling, context, anchor);
    }
    default:
      return 'Unknown technique.';
  }
}

function wordReason(word: string, context: VariationContext): string | null {
  if (!context.recognised) return null;
  return context.recognised.has(word) ? null : `“${word}” is not a recognised English word.`;
}

/**
 * A rhyme also has to say how it relates to the brand. A bare "rhymes with X"
 * is a sound match, not a naming suggestion; the reason must use at least one
 * content word from the selected meaning or commentary.
 */
function rhymeContextReason(reason: string, context: VariationContext): string | null {
  const brand = `${context.meaning ?? ''} ${context.commentary ?? ''}`.trim();
  if (!brand) return null;

  const nameStems = new Set(contentStems(`${context.workingName} ${context.original}`));
  const brandStems = new Set(contentStems(brand).filter((stem) => !nameStems.has(stem)));
  if (brandStems.size === 0) return null;

  return contentStems(reason).some((stem) => brandStems.has(stem))
    ? null
    : 'Say how this rhyme fits the selected meaning and commentary, not just that it rhymes.';
}

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'any',
  'are',
  'because',
  'been',
  'before',
  'being',
  'between',
  'both',
  'brand',
  'but',
  'can',
  'commentary',
  'context',
  'could',
  'does',
  'each',
  'for',
  'from',
  'have',
  'having',
  'into',
  'just',
  'like',
  'fits',
  'fitting',
  'implies',
  'make',
  'many',
  'meaning',
  'more',
  'most',
  'name',
  'not',
  'only',
  'other',
  'our',
  'relate',
  'related',
  'relates',
  'rhyme',
  'rhymes',
  'same',
  'selected',
  'some',
  'sound',
  'sounds',
  'suggests',
  'such',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'very',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'will',
  'with',
  'would',
  'your',
]);

function contentStems(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))
    .map(stem)
    .filter(Boolean);
}

function stem(word: string): string {
  let value = word;

  if (value.endsWith('ies') && value.length > 5) value = `${value.slice(0, -3)}y`;
  else if (value.endsWith('ing') && value.length > 5) value = value.slice(0, -3);
  else if (value.endsWith('ed') && value.length > 4) value = value.slice(0, -2);
  else if (value.endsWith('ly') && value.length > 4) value = value.slice(0, -2);
  else if (value.endsWith('es') && value.length > 4) value = value.slice(0, -2);
  else if (value.endsWith('s') && value.length > 3) value = value.slice(0, -1);

  if (value.length > 4 && value.endsWith('e')) value = value.slice(0, -1);
  return value;
}

function affixReason(
  slot: string,
  fullSpelling: string,
  anchor: string,
  context: VariationContext
): string | null {
  const parts = affixParts(slot, anchor);
  if (!parts) return null;

  // A whole recognised word is acceptable even if it contains a negating piece
  // ("uncommon" is a word). For a phrase, the whole joined spelling is checked
  // first so a recognised modified word cannot smuggle in a negating affix.
  if (context.recognised?.has(fullSpelling)) return null;

  if (isNegatingAffix(parts)) {
    return 'That prefix or suffix negates the working name instead of extending it.';
  }

  if (context.recognised?.has(slot)) return null;

  const isAffix = LINGUISTIC_AFFIXES.has(parts.part);
  if (!isAffix) {
    if (context.recognised?.has(parts.part)) {
      return 'That is a separate word, not a linguistic prefix or suffix.';
    }

    return parts.part.length <= 2
      ? 'That fragment is too short to read as a prefix or suffix.'
      : 'That is not a recognised linguistic prefix or suffix.';
  }

  if (parts.side === 'suffix' && GRAMMATICAL_SUFFIXES.has(parts.part)) {
    if (context.recognised && !context.recognised.has(slot)) {
      return 'That grammatical ending is only allowed when it forms a real word.';
    }
  }

  return null;
}

function isNegatingAffix(parts: AffixParts): boolean {
  return parts.side === 'prefix'
    ? NEGATING_PREFIXES.has(parts.part)
    : NEGATING_SUFFIXES.has(parts.part);
}

function addAffixTerms(terms: Set<string>, spelling: string, anchor: string): void {
  terms.add(spelling);

  const parts = affixParts(spelling, anchor);
  if (parts) terms.add(parts.part);
}

interface PhraseSlot {
  value: string;
}

/**
 * The part of a phrase suggestion that replaced one word.
 *
 * The other words of the phrase must still appear, in order, around the slot;
 * this is what stops a "synonym" that silently drops or reorders the user's
 * words. The slot itself must differ from the word it claims to change.
 */
function phraseSlot(
  spelling: string,
  tokens: readonly string[],
  changedWord: string
): PhraseSlot | { error: string } {
  const index = tokens.indexOf(changedWord);
  if (index < 0) return { error: 'The changed word is not part of the working name.' };

  const before = tokens.slice(0, index).join('');
  const after = tokens.slice(index + 1).join('');

  if (!spelling.startsWith(before) || (after && !spelling.endsWith(after))) {
    return { error: 'Keep the other words of the phrase in place.' };
  }

  const value = spelling.slice(before.length, spelling.length - after.length);
  if (!value) return { error: 'The changed word is missing from the suggestion.' };
  if (value === changedWord) return { error: 'That does not change the word it names.' };

  return { value };
}

function phraseTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
}

function hyphenReason(spelling: string, context: VariationContext, anchor: string): string | null {
  if (context.mode !== 'phrase') {
    return 'A single word has no word boundary to hyphenate.';
  }

  const parts = spelling.split('-');
  if (parts.length !== 2) return 'Use one hyphen between two words.';

  const [left, right] = parts;
  if (left.length < MIN_HYPHEN_SIDE || right.length < MIN_HYPHEN_SIDE) {
    return 'A hyphen must sit between two readable words.';
  }
  if (!/^[a-z]+$/.test(left) || !/^[a-z]+$/.test(right)) {
    return 'A hyphen can only join letters.';
  }
  if (`${left}${right}` !== anchor) {
    return 'Hyphens replace a space; they must not insert or drop letters.';
  }

  const tokens = phraseTokens(context.workingName);
  const boundaries = new Set<number>();
  let offset = 0;

  for (const token of tokens) {
    offset += token.length;
    boundaries.add(offset);
  }
  boundaries.delete(anchor.length);

  return boundaries.has(left.length) ? null : 'Hyphens must fall on a word boundary.';
}

interface AffixParts {
  part: string;
  side: 'prefix' | 'suffix';
}

/** The added letters and their side when the anchor is otherwise intact. */
function affixParts(spelling: string, anchor: string): AffixParts | null {
  if (!anchor || spelling === anchor) return null;

  const extra = spelling.length - anchor.length;
  if (extra < 1 || extra > 12) return null;

  if (spelling.endsWith(anchor)) {
    const prefix = spelling.slice(0, spelling.length - anchor.length);
    if (/^[a-z]+$/.test(prefix)) return { part: prefix, side: 'prefix' };
  }

  if (spelling.startsWith(anchor)) {
    const suffix = spelling.slice(anchor.length);
    if (/^[a-z]+$/.test(suffix)) return { part: suffix, side: 'suffix' };
  }

  return null;
}

/** A spelling that is the anchor with 1–12 extra letters attached. */
function isAffixedTo(spelling: string, anchor: string): boolean {
  return Boolean(affixParts(spelling, anchor));
}

/** "myclean" is a possessive, not an affix round suggestion. */
function startsWithPossessive(spelling: string, anchor: string): boolean {
  return POSSESSIVE_FORMS.some((form) => spelling === `${form}${anchor}`);
}
