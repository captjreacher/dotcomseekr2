import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/index.ts';
import type { AiBinding, D1Database, D1PreparedStatement, D1Result, Env } from '../src/types.ts';
import { estimateUsage } from '../src/pricing.ts';
import type { LexicalBatch, LexicalVerifier } from '../src/lexical.ts';
import { evaluateLimits, parseTrialLimits, sha256Hex, type UsageCounters } from '../src/trial.ts';

const ACCESS_CODE = 'dcs_trial_test_access_code';
const SESSION = '6f9619ff-8b86-4d01-b4d0-00c04fc964ff';
const TURN = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

interface Insert {
  sql: string;
  params: unknown[];
}

class FakeStatement implements D1PreparedStatement {
  private params: unknown[] = [];
  private readonly db: FakeDb;
  private readonly sql: string;

  constructor(db: FakeDb, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    this.params = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes('session_calls_today')) {
      return {
        session_calls_today: this.db.counters.sessionCallsToday,
        session_turns_today: this.db.counters.sessionTurnsToday,
      } as T;
    }

    if (this.sql.includes('total_calls')) {
      return {
        total_calls: this.db.counters.totalCalls,
        total_turns: this.db.counters.totalTurns,
        total_tokens: this.db.counters.totalTokens,
        global_calls_today: this.db.counters.globalCallsToday,
        global_turns_today: this.db.counters.globalTurnsToday,
      } as T;
    }

    return null;
  }

  async all<T>(): Promise<D1Result<T>> {
    return { success: true, results: [] };
  }

  async run(): Promise<D1Result> {
    if (this.db.failInserts) throw new Error('D1 unavailable');

    this.db.inserts.push({ sql: this.sql, params: this.params });
    return { success: true };
  }
}

class FakeDb implements D1Database {
  inserts: Insert[] = [];
  failInserts = false;

  counters: UsageCounters = {
    sessionCallsToday: 0,
    sessionTurnsToday: 0,
    globalCallsToday: 0,
    globalTurnsToday: 0,
    totalCalls: 0,
    totalTurns: 0,
    totalTokens: 0,
  };

  prepare(sql: string): D1PreparedStatement {
    return new FakeStatement(this, sql);
  }
}

class FakeLexical implements LexicalVerifier {
  readonly calls: string[][] = [];
  private readonly recognized: string[];
  private readonly status: 'ok' | 'unavailable';

  constructor(recognized: string[] = [], status: 'ok' | 'unavailable' = 'ok') {
    this.recognized = recognized;
    this.status = status;
  }

  async lookup(terms: readonly string[]): Promise<LexicalBatch> {
    this.calls.push([...terms]);

    return {
      status: this.status,
      recognized: new Set(terms.filter((term) => this.recognized.includes(term))),
      calls: 1,
      cacheHits: 0,
      latencyMs: 4,
      source: 'Wiktionary (Wikimedia Foundation)',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://en.wiktionary.org/wiki/Wiktionary:Copyrights',
      ...(this.status === 'unavailable'
        ? { error: 'The independent dictionary check did not answer in time.' }
        : {}),
    };
  }
}

class FakeAi implements AiBinding {
  calls = 0;
  private readonly outcomes: Array<unknown | Error>;

  constructor(outcomes: Array<unknown | Error>) {
    this.outcomes = outcomes;
  }

  async run(): Promise<unknown> {
    const outcome = this.outcomes[Math.min(this.calls, this.outcomes.length - 1)];
    this.calls += 1;
    if (outcome instanceof Error) throw outcome;
    return outcome;
  }
}

function successPayload(spellings = ['quick', 'rapid'], changedWord = ''): unknown {
  return {
    response: {
      variations: spellings.map((spelling) => ({
        spelling,
        reason: 'Means the same as the working name.',
        changedWord,
      })),
    },
    usage: {
      prompt_tokens: 296,
      completion_tokens: 118,
      total_tokens: 414,
      neurons: 32.06,
    },
  };
}

async function makeEnv(
  outcomes: Array<unknown | Error>,
  overrides: Partial<Env> = {}
): Promise<{ env: Env; db: FakeDb; ai: FakeAi }> {
  const db = new FakeDb();
  const ai = new FakeAi(outcomes);

  return {
    db,
    ai,
    env: {
      AI: ai,
      USAGE_DB: db,
      TRIAL_KEY_HASHES: await sha256Hex(ACCESS_CODE),
      TRIAL_ALLOWED_ORIGINS: 'http://localhost:5173',
      ...overrides,
    },
  };
}

function request(
  body: Record<string, unknown> | null,
  options: { key?: string | null; origin?: string; method?: string; path?: string } = {}
): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  const key = options.key === undefined ? ACCESS_CODE : options.key;
  if (key) headers.set('x-trial-key', key);
  headers.set('x-trial-session', SESSION);
  if (options.origin) headers.set('origin', options.origin);

  return new Request(`https://trial.example${options.path ?? '/v1/variations'}`, {
    method: options.method ?? (body ? 'POST' : 'GET'),
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function variationBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: 'variations',
    technique: 'synonyms',
    mode: 'word',
    original: 'swift',
    workingName: 'swift',
    meaning: 'moving quickly and lightly',
    meaningSource: null,
    commentary: 'private brand commentary that must not be logged',
    previous: [],
    turnId: TURN,
    ...overrides,
  };
}

test('health reports the model without requiring tester access', async () => {
  const { env } = await makeEnv([successPayload()]);
  const response = await handleRequest(request(null, { path: '/v1/health' }), env);
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.provider, 'workers-ai');
  assert.equal(body.model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
});

test('a missing or unknown tester code is rejected without calling the model', async () => {
  const { env, ai, db } = await makeEnv([successPayload()]);

  const missing = await handleRequest(request(variationBody(), { key: null }), env);
  assert.equal(missing.status, 401);
  assert.equal(ai.calls, 0);

  const unknown = await handleRequest(request(variationBody(), { key: 'wrong-code' }), env);
  assert.equal(unknown.status, 401);
  assert.equal(db.inserts.length, 0);
});

test('a successful turn returns validated variations and records usage without brand text', async () => {
  const { env, db, ai } = await makeEnv([successPayload()]);
  const response = await handleRequest(request(variationBody()), env);
  const body = (await response.json()) as Record<string, any>;

  assert.equal(response.status, 200);
  assert.equal(ai.calls, 1);
  assert.equal(body.provider, 'workers-ai');
  assert.equal(body.model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal(body.trial.providerCalls, 1);
  assert.deepEqual(
    body.variations.map((variation: { spelling: string }) => variation.spelling),
    ['quick', 'rapid']
  );

  assert.equal(db.inserts.length, 1);
  const params = db.inserts[0].params;
  assert.equal(params[1], TURN);
  assert.equal(params[3], 'synonyms');
  assert.equal(params[4], 'word');
  assert.equal(params[5], 'workers-ai');
  assert.equal(params[6], '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal(params[7], 1);
  assert.equal(params[8], 'success');
  assert.equal(params[12], 296);
  assert.equal(params[13], 118);
  assert.equal(params[14], 414);
  assert.equal(params[15], 32.06);
  assert.equal(params[16], 'neurons');
  assert.ok(typeof params[17] === 'number' && (params[17] as number) > 0);
  assert.ok(typeof params[18] === 'number' && (params[18] as number) > 0);
  assert.equal(params[20], '2026-10-26');
  assert.equal(params[23], 2);
  assert.equal(params[24], null);
  assert.equal(params[25], null);

  const serialized = JSON.stringify(params);
  assert.ok(!serialized.includes('private brand commentary'));
  assert.ok(!serialized.includes(ACCESS_CODE));
});

test('an answer with no usable suggestions is an empty round, not a success', async () => {
  const { env, db } = await makeEnv([
    {
      response: {
        variations: [{ spelling: 'swift', reason: 'Same as the working name.', changedWord: '' }],
      },
      usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
    },
  ]);

  const response = await handleRequest(request(variationBody()), env);
  const body = (await response.json()) as Record<string, any>;

  assert.equal(response.status, 200);
  assert.equal(body.variations.length, 0);
  assert.equal(body.noResults.reason, 'quality_no_results');
  assert.match(body.noResults.message, /No suggestion/i);
  assert.equal(body.trial.providerCalls, 1);
  assert.equal(db.inserts.length, 1);
  assert.equal(db.inserts[0].params[8], 'validation_rejected');
  assert.equal(db.inserts[0].params[9], 200);
  assert.equal(db.inserts[0].params[22], 1);
  assert.equal(db.inserts[0].params[23], 0);
});

test('an empty model answer is reported as an empty round', async () => {
  const { env, db } = await makeEnv([
    {
      response: { variations: [] },
      usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
    },
  ]);

  const response = await handleRequest(request(variationBody()), env);
  const body = (await response.json()) as Record<string, any>;

  assert.equal(response.status, 200);
  assert.equal(body.noResults.reason, 'empty_model_response');
  assert.equal(db.inserts[0].params[10], 'ai_no_suggestions');
});

test('a malformed model shape is still a provider failure', async () => {
  const { env } = await makeEnv([
    {
      response: { notVariations: [] },
      usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
    },
  ]);

  const response = await handleRequest(request(variationBody()), env);
  const body = (await response.json()) as Record<string, any>;

  assert.equal(response.status, 502);
  assert.equal(body.code, 'ai_invalid_output');
});

test('rhymes must be recognised words and invented spellings are rejected', async () => {
  const lexical = new FakeLexical(['plane', 'train', 'grain']);
  const { env, db } = await makeEnv([successPayload(['plane', 'train', 'grane'])], {});

  const response = await handleRequest(
    request(variationBody({ technique: 'rhymes', workingName: 'crane', original: 'crane' })),
    env,
    { lexical }
  );
  const body = (await response.json()) as Record<string, any>;

  assert.equal(response.status, 200);
  assert.deepEqual(
    body.variations.map((variation: { spelling: string }) => variation.spelling),
    ['plane', 'train']
  );
  assert.equal(body.rejected.length, 1);
  assert.match(body.rejected[0].reason, /recognised English word/i);
  assert.equal(body.lexical.verified, true);
  assert.equal(body.lexical.calls, 1);
  assert.deepEqual(lexical.calls[0], ['plane', 'train', 'grane']);
  assert.equal(db.inserts[0].params[23], 2);
  assert.equal(db.inserts[0].params[24], 1);
});

test('phrase rhymes check the replaced word, not the joined domain phrase', async () => {
  const lexical = new FakeLexical([]);
  const { env } = await makeEnv([successPayload(['blueflorit'], 'orbit')], {});

  const response = await handleRequest(
    request(
      variationBody({
        technique: 'rhymes',
        mode: 'phrase',
        workingName: 'blue orbit',
        original: 'blue orbit',
      })
    ),
    env,
    { lexical }
  );
  const body = (await response.json()) as Record<string, any>;

  assert.equal(response.status, 200);
  assert.equal(body.noResults.reason, 'quality_no_results');
  assert.deepEqual(lexical.calls[0], ['florit']);
  assert.ok(!lexical.calls[0].includes('blueflorit'));
});

test('affixes need a real word or a familiar brand affix', async () => {
  const lexical = new FakeLexical(['swiftly', 'swiftness']);
  const { env } = await makeEnv(
    [successPayload(['swiftly', 'swiftness', 'swiftier', 'swiftify'])],
    {}
  );

  const response = await handleRequest(
    request(variationBody({ technique: 'affixes', workingName: 'swift', original: 'swift' })),
    env,
    { lexical }
  );
  const body = (await response.json()) as Record<string, any>;

  assert.equal(response.status, 200);
  assert.deepEqual(
    body.variations.map((variation: { spelling: string }) => variation.spelling),
    ['swiftly', 'swiftness', 'swiftify']
  );
  assert.equal(body.rejected.length, 1);
  assert.match(body.rejected[0].reason, /grammatical ending/i);
});

test('a negating affix cannot be used to invent a longer phrase', async () => {
  const lexical = new FakeLexical(['common', 'ground', 'uncommon']);
  const { env } = await makeEnv([successPayload(['uncommonground'], 'common')], {});

  const response = await handleRequest(
    request(
      variationBody({
        technique: 'affixes',
        mode: 'phrase',
        workingName: 'common ground',
        original: 'common ground',
      })
    ),
    env,
    { lexical }
  );
  const body = (await response.json()) as Record<string, any>;

  assert.equal(response.status, 200);
  assert.equal(body.variations.length, 0);
  assert.match(body.rejected[0].reason, /negates/i);
});

test('third-person possessives are rejected as awkward', async () => {
  const { env } = await makeEnv([successPayload(['herswift', 'ourswift', 'theirswift'])]);

  const response = await handleRequest(
    request(
      variationBody({
        technique: 'possessives',
        workingName: 'swift',
        original: 'swift',
      })
    ),
    env
  );
  const body = (await response.json()) as Record<string, any>;

  assert.deepEqual(
    body.variations.map((variation: { spelling: string }) => variation.spelling),
    ['ourswift', 'theirswift']
  );
  assert.match(body.rejected[0].reason, /third-person/i);
});

test('unavailable lexical verification withholds suggestions honestly', async () => {
  const lexical = new FakeLexical([], 'unavailable');
  const { env, db } = await makeEnv([successPayload(['mean'], '')], {});

  const response = await handleRequest(
    request(variationBody({ technique: 'rhymes', workingName: 'clean', original: 'clean' })),
    env,
    { lexical }
  );
  const body = (await response.json()) as Record<string, any>;

  assert.equal(response.status, 503);
  assert.equal(body.code, 'lexical_unavailable');
  assert.equal(body.variations, undefined);
  assert.equal(body.lexical.verified, false);
  assert.equal(db.inserts[0].params[8], 'validation_rejected');
  assert.equal(db.inserts[0].params[9], 503);
  assert.equal(db.inserts[0].params[10], 'lexical_unavailable');
  assert.equal(db.inserts[0].params[23], 0);
  assert.equal(db.inserts[0].params[24], 1);
});

test('a transient provider failure is retried and both attempts are recorded', async () => {
  const rateLimited = Object.assign(new Error('rate limited'), { status: 429 });
  const { env, db, ai } = await makeEnv([rateLimited, successPayload()]);

  const response = await handleRequest(request(variationBody()), env);
  const body = (await response.json()) as Record<string, any>;

  assert.equal(response.status, 200);
  assert.equal(ai.calls, 2);
  assert.equal(body.trial.providerCalls, 2);
  assert.equal(db.inserts.length, 2);
  assert.equal(db.inserts[0].params[7], 1);
  assert.equal(db.inserts[0].params[8], 'provider_error');
  assert.equal(db.inserts[0].params[9], 503);
  assert.equal(db.inserts[1].params[7], 2);
  assert.equal(db.inserts[1].params[8], 'success');
});

test('an exhausted free allocation fails honestly and does not fall back', async () => {
  const quota = Object.assign(new Error('daily free allocation used'), { code: 3036 });
  const { env, db, ai } = await makeEnv([quota]);

  const response = await handleRequest(request(variationBody()), env);
  const body = (await response.json()) as Record<string, any>;

  assert.equal(response.status, 503);
  assert.equal(body.code, 'ai_quota');
  assert.equal(ai.calls, 1);
  assert.equal(db.inserts.length, 1);
  assert.equal(db.inserts[0].params[8], 'provider_error');
  assert.equal(db.inserts[0].params[10], 'ai_quota');
});

test('a reached shared daily call allowance returns 429 before the model is called', async () => {
  const { env, db, ai } = await makeEnv([successPayload()]);
  db.counters.globalCallsToday = 50;

  const response = await handleRequest(request(variationBody()), env);
  const body = (await response.json()) as Record<string, any>;

  assert.equal(response.status, 429);
  assert.equal(body.code, 'trial_limit');
  assert.equal(body.limit, 'global_calls_per_day');
  assert.equal(ai.calls, 0);
});

test('suggestions are withheld when usage cannot be recorded', async () => {
  const { env, db } = await makeEnv([successPayload()]);
  db.failInserts = true;

  const response = await handleRequest(request(variationBody()), env);
  const body = (await response.json()) as Record<string, any>;

  assert.equal(response.status, 503);
  assert.equal(body.code, 'trial_accounting_failed');
  assert.equal(body.variations, undefined);
});

test('an unlisted browser origin is rejected while an allowlisted one gets CORS', async () => {
  const { env } = await makeEnv([successPayload()]);

  const blocked = await handleRequest(
    request(variationBody(), { origin: 'https://evil.example' }),
    env
  );
  assert.equal(blocked.status, 403);

  const allowed = await handleRequest(
    request(variationBody(), { origin: 'http://localhost:5173' }),
    env
  );
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('limits fail closed on each allowance and are configurable', () => {
  const counters: UsageCounters = {
    sessionCallsToday: 0,
    sessionTurnsToday: 0,
    globalCallsToday: 0,
    globalTurnsToday: 0,
    totalCalls: 0,
    totalTurns: 0,
    totalTokens: 0,
  };
  const limits = {
    sessionTurnsPerDay: 2,
    sessionCallsPerDay: 3,
    globalTurnsPerDay: 4,
    globalCallsPerDay: 5,
    totalTurns: 6,
    totalCalls: 7,
    totalTokens: 800,
  };

  assert.equal(evaluateLimits(counters, limits).allowed, true);
  assert.equal(evaluateLimits({ ...counters, totalTokens: 800 }, limits).limit, 'trial_tokens');
  assert.equal(evaluateLimits({ ...counters, totalTurns: 6 }, limits).limit, 'trial_turns');
  assert.equal(evaluateLimits({ ...counters, totalCalls: 7 }, limits).limit, 'trial_calls');
  assert.equal(
    evaluateLimits({ ...counters, globalCallsToday: 5 }, limits).limit,
    'global_calls_per_day'
  );
  assert.equal(
    evaluateLimits({ ...counters, globalTurnsToday: 4 }, limits).limit,
    'global_turns_per_day'
  );
  assert.equal(
    evaluateLimits({ ...counters, sessionTurnsToday: 2 }, limits).limit,
    'session_turns_per_day'
  );
  assert.equal(
    evaluateLimits({ ...counters, sessionCallsToday: 3 }, limits).limit,
    'session_calls_per_day'
  );

  const parsed = parseTrialLimits({
    TRIAL_SESSION_TURNS_PER_DAY: '1',
    TRIAL_TOTAL_TOKENS: 'not-a-number',
  });
  assert.equal(parsed.sessionTurnsPerDay, 1);
  assert.equal(parsed.totalTokens, 400_000);
});

test('cost is estimated only when both token counts are known', () => {
  const full = estimateUsage('@cf/meta/llama-3.3-70b-instruct-fp8-fast', 296, 118);
  assert.ok(full.estimatedCostUsd !== null && full.estimatedCostUsd > 0);
  assert.ok(full.estimatedNeurons !== null && Math.abs(full.estimatedNeurons - 32.06) < 0.02);

  const partial = estimateUsage('@cf/meta/llama-3.3-70b-instruct-fp8-fast', 296, null);
  assert.equal(partial.estimatedCostUsd, null);
  assert.equal(partial.estimatedNeurons, null);

  const unknownModel = estimateUsage('@cf/unknown/model', 100, 100);
  assert.equal(unknownModel.estimatedCostUsd, null);
});
