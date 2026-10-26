// Independent real-word verification for the isolated trial.
//
// The model's claim that a spelling is a word is not evidence. Rhyme and affix
// candidates are checked against Wiktionary through its public definition API,
// and the answer is cached in D1 by a hash of the term so usage data does not
// grow a plaintext list of brand words. Wikimedia does not charge for the API;
// the only cost recorded is latency and call count.
import {
  LEXICAL_SOURCE,
  parseLexicalResponse,
} from '../../../apps/web/src/lib/discovery/lexical.ts';
import { sha256Hex } from './trial.ts';
import type { D1Database } from './types.ts';

export const LEXICAL_TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_TERMS = 24;
const TERM_PATTERN = /^[a-z]{1,40}$/;
const USER_AGENT = 'DotcomSeekrDiscoveryTrial/0.1 (https://github.com/captjreacher/dotcomseekr2)';

export interface LexicalBatch {
  status: 'ok' | 'unavailable';
  recognized: Set<string>;
  calls: number;
  cacheHits: number;
  latencyMs: number;
  source: string;
  license: string;
  licenseUrl: string;
  error?: string;
}

export interface LexicalVerifier {
  lookup(terms: readonly string[], options?: { signal?: AbortSignal }): Promise<LexicalBatch>;
}

interface FetchOutcome {
  term: string;
  recognized: boolean;
  httpStatus: number;
  error?: string;
}

interface CacheRow {
  recognized: number;
  fetched_at: string;
}

function cacheCutoff(now: number): string {
  return new Date(now - CACHE_TTL_MS).toISOString();
}

function result(
  status: LexicalBatch['status'],
  recognized: Set<string>,
  calls: number,
  cacheHits: number,
  started: number,
  error?: string
): LexicalBatch {
  return {
    status,
    recognized,
    calls,
    cacheHits,
    latencyMs: Date.now() - started,
    source: LEXICAL_SOURCE.name,
    license: LEXICAL_SOURCE.license,
    licenseUrl: LEXICAL_SOURCE.licenseUrl,
    ...(error ? { error } : {}),
  };
}

async function fetchTerm(
  term: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined
): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LEXICAL_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetchImpl(`${LEXICAL_SOURCE.api}${encodeURIComponent(term)}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });

    // A missing page is a real negative answer, not an outage.
    if (response.status === 404) {
      return { term, recognized: false, httpStatus: 404 };
    }

    if (!response.ok) {
      return {
        term,
        recognized: false,
        httpStatus: response.status,
        error: `The independent dictionary check returned HTTP ${response.status}.`,
      };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return {
        term,
        recognized: false,
        httpStatus: response.status,
        error: 'The independent dictionary check returned unreadable data.',
      };
    }

    return {
      term,
      recognized: parseLexicalResponse(payload).recognized,
      httpStatus: response.status,
    };
  } catch (error) {
    const timedOut =
      error instanceof Error && /abort|timed? ?out/i.test(`${error.name} ${error.message}`);
    return {
      term,
      recognized: false,
      httpStatus: 0,
      error: timedOut
        ? 'The independent dictionary check did not answer in time.'
        : 'The independent dictionary check could not be reached.',
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export function createLexicalVerifier(
  db: D1Database | undefined,
  fetchImpl: typeof fetch = fetch
): LexicalVerifier {
  return {
    async lookup(terms, options = {}) {
      const started = Date.now();
      const unique = [
        ...new Set(
          terms.map((term) => term.trim().toLowerCase()).filter((term) => TERM_PATTERN.test(term))
        ),
      ].slice(0, MAX_TERMS);

      if (unique.length === 0) {
        return result('ok', new Set(), 0, 0, started);
      }

      const recognized = new Set<string>();
      const missing: string[] = [];
      let cacheHits = 0;

      if (db) {
        const cutoff = cacheCutoff(started);
        const hashes = await Promise.all(unique.map((term) => sha256Hex(term)));

        const rows = await Promise.all(
          hashes.map(async (hash) => {
            try {
              const row = await db
                .prepare('SELECT recognized, fetched_at FROM lexical_cache WHERE term_hash = ?')
                .bind(hash)
                .first<CacheRow>();
              return row && row.fetched_at >= cutoff ? row : null;
            } catch {
              // The cache is an optimisation. A cache read failure must not
              // turn into a false "word is unrecognised" answer.
              return null;
            }
          })
        );

        rows.forEach((row, index) => {
          if (row) {
            cacheHits += 1;
            if (Number(row.recognized) === 1) recognized.add(unique[index]);
          } else {
            missing.push(unique[index]);
          }
        });
      } else {
        missing.push(...unique);
      }

      if (missing.length === 0) {
        return result('ok', recognized, 0, cacheHits, started);
      }

      const outcomes = await Promise.all(
        missing.map((term) => fetchTerm(term, fetchImpl, options.signal))
      );

      const failure = outcomes.find((outcome) => outcome.error);
      if (failure) {
        return result(
          'unavailable',
          recognized,
          outcomes.length,
          cacheHits,
          started,
          failure.error
        );
      }

      for (const outcome of outcomes) {
        if (outcome.recognized) recognized.add(outcome.term);
      }

      if (db) {
        const fetchedAt = new Date().toISOString();
        await Promise.all(
          outcomes.map(async (outcome) => {
            const hash = await sha256Hex(outcome.term);
            try {
              await db
                .prepare(
                  `INSERT INTO lexical_cache
                     (term_hash, recognized, source, license, http_status, fetched_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(term_hash) DO UPDATE SET
                     recognized = excluded.recognized,
                     source = excluded.source,
                     license = excluded.license,
                     http_status = excluded.http_status,
                     fetched_at = excluded.fetched_at`
                )
                .bind(
                  hash,
                  outcome.recognized ? 1 : 0,
                  LEXICAL_SOURCE.name,
                  LEXICAL_SOURCE.license,
                  outcome.httpStatus,
                  fetchedAt
                )
                .run();
            } catch {
              // A cache write is not part of the correctness decision.
              console.error('lexical cache write failed');
            }
          })
        );
      }

      return result('ok', recognized, outcomes.length, cacheHits, started);
    },
  };
}
