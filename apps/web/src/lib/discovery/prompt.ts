// The one prompt and JSON contract used for guided discovery suggestions.
//
// Both the existing Supabase/OpenAI edge function and the Cloudflare Workers AI
// trial adapter import this module, so switching provider cannot silently change
// the technique rules, the candidate cap, or the shape the validator expects.
import { MAX_VARIATIONS_PER_ROUND } from './domains.ts';
import { TECHNIQUE_LABELS, TECHNIQUE_RULES } from './techniques.ts';
import type { DiscoveryMode, Technique } from './types.ts';

function text(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/** Build the system and user messages for one technique round. */
export function buildVariationPrompt(
  body: Record<string, unknown>,
  technique: Technique
): { system: string; user: string } {
  const mode = body.mode === 'phrase' ? 'phrase' : 'word';
  const original = text(body.original, 80);
  const workingName = text(body.workingName, 80) || original;
  const meaning = text(body.meaning, 400);
  const meaningSource = text(body.meaningSource, 120);
  const commentary = text(body.commentary, 400);
  const previous = Array.isArray(body.previous)
    ? body.previous
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 40)
    : [];

  const systemParts = [
    'You propose domain name variations for one brand, using exactly one technique per answer.',
    'The selected meaning and the brand commentary are binding. Every suggestion must keep that meaning and commentary; never substitute an unrelated word, a different technique, or a different sense of the name. If the best available option would contradict them, return an empty list.',
    TECHNIQUE_RULES[technique],
    mode === 'phrase'
      ? 'The working name is a phrase. For synonyms, rhymes and affixes, change exactly one word, keep every other word in its place, and name the changed word in "changedWord". Possessives go before the whole phrase and hyphens join its words, so those do not need a changed word.'
      : 'The working name is one word: do not invent multi-word compounds, and do not use hyphens.',
    `Return at most ${MAX_VARIATIONS_PER_ROUND} suggestions. Return fewer when good options are scarce: one good idea is better than five, and an empty list is better than filler. Never pad the list.`,
    'For rhymes, every replaced word must be a current, recognised English word, and the reason must say how its ordinary meaning relates to the selected meaning and commentary; a bare sound match is not enough. Never invent a spelling or use an obsolete form to make a rhyme. For affixes, add a bound linguistic prefix or suffix (for example re-, -able, -ness, -ish or -ify), never a separate word or compound such as -hire, -works or -pro. If you cannot meet those rules, return an empty list instead.',
    'Never label a suggestion as strong, recommended or a premium pick; give a short factual reason that says how it fits the selected meaning and commentary.',
    'Reply with JSON only, shaped as {"variations":[{"spelling":"...","reason":"...","changedWord":"..."}]}.',
    'Never return the working name itself or the original brand input as a suggestion.',
    'Always include "changedWord" as an empty string when no word is replaced.',
    'Spellings are bare domain labels: lowercase letters, digits or hyphens, no extension.',
  ];

  if (mode === 'phrase') {
    const tokens = workingName
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9]/g, ''))
      .filter(Boolean);

    if (technique === 'hyphens') {
      systemParts.push(
        'Phrase format: replace the single space in the working name with one hyphen (for example, "blue orbit" is written "blue-orbit"). Do not add spaces or extra hyphens.'
      );
    } else if (technique === 'possessives') {
      systemParts.push(
        'Phrase format: put the possessive directly before the joined phrase with no space or hyphen (for example, "ourblueorbit"). Use only my, your, our or their; his, her and its are not allowed.'
      );
    } else {
      systemParts.push(
        'Phrase format: remove every space and do not add hyphens. Join the unchanged words directly to the changed word (for example, "blueorbit" becomes "bluecircle" when "orbit" changes).'
      );
      if (technique === 'affixes') {
        systemParts.push(
          'Attach the prefix or suffix to exactly one word of the phrase, not to the whole phrase, and name that word in "changedWord".'
        );
      }
      systemParts.push(`"changedWord" must be exactly one of these words: ${tokens.join(', ')}.`);
    }
  }

  const system = systemParts.join(' ');

  const user = [
    `Technique: ${TECHNIQUE_LABELS[technique]}.`,
    `Original brand input: ${original}`,
    `Working name for this round: ${workingName}`,
    `Selected meaning: ${meaning || '(not supplied)'}`,
    meaningSource ? `Meaning source: ${meaningSource}` : '',
    commentary ? `Brand commentary: ${commentary}` : '',
    previous.length > 0 ? `Already suggested (do not repeat): ${previous.join(', ')}` : '',
    'Only this technique. Do not mix techniques.',
  ]
    .filter(Boolean)
    .join('\n');

  return { system, user };
}

/**
 * JSON Schema for Workers AI JSON Mode. It mirrors the shape the shared
 * validator already expects; the validator remains the authority because
 * Cloudflare documents that schema compliance is not guaranteed.
 */
export const VARIATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    variations: {
      type: 'array',
      maxItems: MAX_VARIATIONS_PER_ROUND,
      items: {
        type: 'object',
        properties: {
          spelling: { type: 'string' },
          reason: { type: 'string' },
          changedWord: { type: 'string' },
        },
        required: ['spelling', 'reason', 'changedWord'],
      },
    },
  },
  required: ['variations'],
} as const;

/**
 * A per-round schema that encodes the same formatting rules the validator
 * enforces. The validator remains authoritative; this only makes the required
 * shape explicit to the model.
 */
export function buildVariationSchema(
  technique: Technique,
  mode: DiscoveryMode,
  workingName: string
): Record<string, unknown> {
  const tokens = workingName
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);

  const changedWordNeeded =
    mode === 'phrase' && ['synonyms', 'rhymes', 'affixes'].includes(technique);

  let spellingPattern = '^[a-z0-9]+$';
  if (technique === 'hyphens') spellingPattern = '^[a-z0-9]+-[a-z0-9]+$';
  if (technique === 'possessives') spellingPattern = '^(my|your|our|their)[a-z]+$';

  return {
    type: 'object',
    properties: {
      variations: {
        type: 'array',
        maxItems: MAX_VARIATIONS_PER_ROUND,
        items: {
          type: 'object',
          properties: {
            spelling: { type: 'string', pattern: spellingPattern },
            reason: { type: 'string' },
            changedWord: changedWordNeeded ? { type: 'string', enum: tokens } : { type: 'string' },
          },
          required: ['spelling', 'reason', 'changedWord'],
        },
      },
    },
    required: ['variations'],
  };
}
