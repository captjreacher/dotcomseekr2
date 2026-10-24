// Dictionary definitions for the brand step.
//
// Definitions come from the Free Dictionary API (Wiktionary-derived) and are
// always shown with that attribution. A phrase with no entry is reported as
// having no entry; nothing is invented to fill the gap.
import { normalizeOriginal } from './domains.ts';

export const DICTIONARY_SOURCE = {
  name: 'Free Dictionary API',
  url: 'https://dictionaryapi.dev/',
  detail: 'Wiktionary-derived definitions',
} as const;

export interface DictionarySense {
  partOfSpeech: string;
  definition: string;
}

export interface DictionaryLookup {
  term: string;
  senses: DictionarySense[];
  source: typeof DICTIONARY_SOURCE | null;
  /** True when the dictionary has no entry for this term. */
  noEntry: boolean;
  error?: string;
}

const endpoint = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const maxSenses = 8;
const maxDefinitionLength = 280;

export async function lookupDefinitions(
  term: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  } = {}
): Promise<DictionaryLookup> {
  const value = normalizeOriginal(term);
  const base: DictionaryLookup = { term: value, senses: [], source: null, noEntry: false };

  if (!value) return { ...base, noEntry: true };

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetchImpl(`${endpoint}${encodeURIComponent(value)}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (response.status === 404) {
      return { ...base, noEntry: true };
    }

    if (!response.ok) {
      return {
        ...base,
        noEntry: true,
        error: `The dictionary returned HTTP ${response.status}. You can describe the meaning yourself.`,
      };
    }

    const payload: unknown = await response.json();
    const senses = readSenses(payload);

    if (senses.length === 0) return { ...base, noEntry: true };

    return { term: value, senses, source: DICTIONARY_SOURCE, noEntry: false };
  } catch (error) {
    return {
      ...base,
      noEntry: true,
      error:
        error instanceof Error && /abort/i.test(error.name)
          ? 'The dictionary did not answer in time. You can describe the meaning yourself.'
          : 'The dictionary could not be reached. You can describe the meaning yourself.',
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

function readSenses(payload: unknown): DictionarySense[] {
  if (!Array.isArray(payload) || payload.length === 0) return [];

  const senses: DictionarySense[] = [];
  const seen = new Set<string>();

  for (const entry of payload) {
    const meanings = (entry as { meanings?: unknown }).meanings;
    if (!Array.isArray(meanings)) continue;

    for (const meaning of meanings) {
      const partOfSpeech =
        typeof (meaning as { partOfSpeech?: unknown }).partOfSpeech === 'string'
          ? ((meaning as { partOfSpeech: string }).partOfSpeech as string).trim()
          : '';
      const definitions = (meaning as { definitions?: unknown }).definitions;
      if (!Array.isArray(definitions)) continue;

      for (const definition of definitions) {
        const text =
          typeof (definition as { definition?: unknown }).definition === 'string'
            ? ((definition as { definition: string }).definition as string).trim()
            : '';
        if (!text) continue;

        const trimmed = text.slice(0, maxDefinitionLength);
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;

        seen.add(key);
        senses.push({ partOfSpeech, definition: trimmed });
        if (senses.length >= maxSenses) return senses;
      }
    }
  }

  return senses;
}
