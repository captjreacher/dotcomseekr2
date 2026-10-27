// Dictionary definitions for the brand step.
//
// Definitions come from Wiktionary and are always shown with that attribution.
// The lookup is proxied through the discovery function so one place parses the
// source's HTML-bearing definitions, and a phrase with no entry is reported as
// having no entry; nothing is invented.
import { normalizeOriginal } from './domains.ts';

export const DICTIONARY_SOURCE = {
  name: 'Wiktionary',
  url: 'https://en.wiktionary.org/',
  detail: 'Wikimedia Foundation definitions (CC BY-SA)',
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

const maxSenses = 8;

interface LookupOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Functions base URL; defaults to the configured Vite env value. */
  functionsUrl?: string;
}

function functionsBase(): string {
  const configured = import.meta.env?.VITE_SUPABASE_FUNCTIONS_URL ?? '';
  return configured.replace(/\/$/, '');
}

export async function lookupDefinitions(
  term: string,
  options: LookupOptions = {}
): Promise<DictionaryLookup> {
  const value = normalizeOriginal(term);
  const base: DictionaryLookup = { term: value, senses: [], source: null, noEntry: false };

  if (!value) return { ...base, noEntry: true };

  const functionsUrl = (options.functionsUrl ?? functionsBase()).replace(/\/$/, '');
  if (!functionsUrl) {
    return {
      ...base,
      noEntry: true,
      error: 'Dictionary lookup is not configured. You can describe the meaning yourself.',
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetchImpl(`${functionsUrl}/dotcomseekr-discovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'definitions', term: value }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ...base,
        noEntry: true,
        error: `The dictionary returned HTTP ${response.status}. You can describe the meaning yourself.`,
      };
    }

    const payload = (await response.json()) as {
      senses?: unknown;
      noEntry?: unknown;
      error?: unknown;
    };
    const senses = readSenses(payload.senses);

    if (senses.length === 0) {
      return {
        ...base,
        noEntry: true,
        error: typeof payload.error === 'string' ? payload.error : undefined,
      };
    }

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

function readSenses(raw: unknown): DictionarySense[] {
  if (!Array.isArray(raw)) return [];

  const senses: DictionarySense[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const definition =
      typeof (item as { definition?: unknown }).definition === 'string'
        ? ((item as { definition: string }).definition as string).trim()
        : '';
    if (!definition) continue;

    const key = definition.toLowerCase();
    if (seen.has(key)) continue;

    const partOfSpeech =
      typeof (item as { partOfSpeech?: unknown }).partOfSpeech === 'string'
        ? ((item as { partOfSpeech: string }).partOfSpeech as string).trim()
        : '';

    seen.add(key);
    senses.push({ partOfSpeech, definition: definition.slice(0, 280) });
    if (senses.length >= maxSenses) break;
  }

  return senses;
}
