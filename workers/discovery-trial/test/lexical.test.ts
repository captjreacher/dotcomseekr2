import test from 'node:test';
import assert from 'node:assert/strict';

import { createLexicalVerifier } from '../src/lexical.ts';
import { sha256Hex } from '../src/trial.ts';
import type { D1Database, D1PreparedStatement, D1Result } from '../src/types.ts';

interface CacheRow {
  recognized: number;
  fetched_at: string;
  [key: string]: unknown;
}

class CacheStatement implements D1PreparedStatement {
  private params: unknown[] = [];
  private readonly db: CacheDb;
  private readonly sql: string;

  constructor(db: CacheDb, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    this.params = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (!this.sql.includes('FROM lexical_cache')) return null;
    const row = this.db.rows.get(String(this.params[0]));
    return (row as T | undefined) ?? null;
  }

  async all<T>(): Promise<D1Result<T>> {
    return { success: true, results: [] };
  }

  async run(): Promise<D1Result> {
    if (this.db.failWrites) throw new Error('D1 unavailable');
    if (this.sql.includes('INSERT INTO lexical_cache')) {
      this.db.inserts.push(this.params);
      this.db.rows.set(String(this.params[0]), {
        recognized: Number(this.params[1]),
        fetched_at: String(this.params[5]),
      });
    }
    return { success: true };
  }
}

class CacheDb implements D1Database {
  readonly rows = new Map<string, CacheRow>();
  readonly inserts: unknown[][] = [];
  failWrites = false;

  prepare(sql: string): D1PreparedStatement {
    return new CacheStatement(this, sql);
  }
}

function definition(partOfSpeech: string, text: string): unknown {
  return { en: [{ partOfSpeech, definitions: [{ definition: text }] }] };
}

function fakeFetch(responses: Record<string, unknown>, calls: string[]): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const term = decodeURIComponent(url.split('/').pop() ?? '');
    const body = responses[term];
    if (body === undefined) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

test('lexical verification recognises a word, caches it by hash and reuses the cache', async () => {
  const db = new CacheDb();
  const calls: string[] = [];
  const fetchImpl = fakeFetch({ clean: definition('Adjective', 'Free from dirt.') }, calls);

  const first = await createLexicalVerifier(db, fetchImpl).lookup(['clean', 'clean']);
  assert.equal(first.status, 'ok');
  assert.equal(first.recognized.has('clean'), true);
  assert.equal(first.calls, 1);
  assert.equal(first.cacheHits, 0);
  assert.equal(db.inserts.length, 1);
  assert.equal(db.inserts[0][0], await sha256Hex('clean'));
  assert.notEqual(db.inserts[0][0], 'clean');

  const second = await createLexicalVerifier(db, fetchImpl).lookup(['clean']);
  assert.equal(second.status, 'ok');
  assert.equal(second.recognized.has('clean'), true);
  assert.equal(second.calls, 0);
  assert.equal(second.cacheHits, 1);
  assert.equal(calls.length, 1);
});

test('obsolete spellings are cached as unrecognised', async () => {
  const db = new CacheDb();
  const calls: string[] = [];
  const fetchImpl = fakeFetch(
    {
      grane: definition(
        'Verb',
        '<a href="/wiki/Appendix:Glossary#obsolete">Obsolete</a> form of groan.'
      ),
    },
    calls
  );

  const result = await createLexicalVerifier(db, fetchImpl).lookup(['grane']);

  assert.equal(result.status, 'ok');
  assert.equal(result.recognized.has('grane'), false);
  assert.equal(db.inserts[0][1], 0);
});

test('a dictionary outage is unavailable, not a negative word verdict', async () => {
  const db = new CacheDb();
  const fetchImpl = (async () => new Response('server error', { status: 500 })) as typeof fetch;

  const result = await createLexicalVerifier(db, fetchImpl).lookup(['clean']);

  assert.equal(result.status, 'unavailable');
  assert.match(result.error ?? '', /HTTP 500/);
  assert.equal(db.inserts.length, 0);
});
