// Validation for model-proposed name variations.
//
// The model is untrusted: it can return the wrong technique, the original name,
// filler, six suggestions where five were allowed, or a hyphen in the middle of
// a syllable. Every answer is validated here, on the server before it is
// returned and again in the browser before it is rendered, using the same rules.
import { MAX_VARIATIONS_PER_ROUND, isValidLabel, joinLabel } from './domains.ts';
import { POSSESSIVE_FORMS, rhymeKey } from './techniques.ts';
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
}

export interface SanitizedVariations {
  variations: Variation[];
  rejected: RejectedVariation[];
}

const MAX_REASON_LENGTH = 200;
const MAX_SPELLING_LENGTH = 40;
const MIN_HYPHEN_SIDE = 3;

/**
 * Validate and cap a raw model payload.
 *
 * At most {@link MAX_VARIATIONS_PER_ROUND} suggestions survive a round; anything
 * off-technique, duplicated, already shown, or malformed is rejected with a
 * reason rather than silently dropped, so the UI can explain a thin round.
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

  if (context.mode === 'phrase' && context.technique !== 'hyphens') {
    const tokens = context.workingName.toLowerCase().split(/\s+/).filter(Boolean);

    if (!changedWord) return 'Say which word this replaces or modifies.';
    if (!tokens.includes(changedWord)) return 'The changed word is not part of the working name.';
  }

  switch (context.technique) {
    case 'synonyms': {
      if (isAffixedTo(spelling, anchor)) {
        return 'That is a prefix/suffix variation, not a synonym.';
      }
      return null;
    }
    case 'rhymes': {
      const tokens = context.workingName.toLowerCase().split(/\s+/).filter(Boolean);
      const spellingKey = rhymeKey(spelling);
      const rhymes = tokens.some((token) => rhymeKey(token) === spellingKey);

      return rhymes ? null : 'Not a genuine rhyme of the working name.';
    }
    case 'affixes': {
      return isAffixedTo(spelling, anchor)
        ? null
        : 'Must be the working name with a readable prefix or suffix.';
    }
    case 'possessives': {
      const possessive = POSSESSIVE_FORMS.find((form) => spelling === `${form}${anchor}`);
      return possessive ? null : 'Must be a possessive form placed before the working name.';
    }
    case 'hyphens': {
      return hyphenReason(spelling, context, anchor);
    }
    default:
      return 'Unknown technique.';
  }
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

  const tokens = context.workingName.toLowerCase().split(/\s+/).filter(Boolean);
  const boundaries = new Set<number>();
  let offset = 0;

  for (const token of tokens) {
    offset += token.replace(/[^a-z0-9]/g, '').length;
    boundaries.add(offset);
  }
  boundaries.delete(anchor.length);

  return boundaries.has(left.length) ? null : 'Hyphens must fall on a word boundary.';
}

/** A spelling that is the anchor with 1–12 extra letters attached. */
function isAffixedTo(spelling: string, anchor: string): boolean {
  if (!anchor || spelling === anchor) return false;

  const extra = spelling.length - anchor.length;
  if (extra < 1 || extra > 12) return false;

  const prefix = spelling.slice(0, spelling.length - anchor.length);
  const suffix = spelling.slice(anchor.length);

  if (spelling.endsWith(anchor) && /^[a-z]+$/.test(prefix)) return true;
  if (spelling.startsWith(anchor) && /^[a-z]+$/.test(suffix)) return true;

  return false;
}
