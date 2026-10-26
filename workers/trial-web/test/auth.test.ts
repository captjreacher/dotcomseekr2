import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, type Env } from '../src/index.ts';

const CODE = 'test-tester-code';
const SECRET = 'test-session-secret-that-is-long-enough';
const ORIGIN = 'https://trial.example';

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const HASH = await sha256Hex(CODE);

function makeEnv(overrides: Partial<Env> = {}) {
  const assets = {
    calls: 0,
    async fetch() {
      assets.calls += 1;
      return new Response('app shell', { status: 200, headers: { 'content-type': 'text/html' } });
    },
  };

  const env: Env = {
    ASSETS: assets,
    FRONTEND_ACCESS_HASHES: HASH,
    SESSION_SECRET: SECRET,
    APP_ORIGIN: ORIGIN,
    ...overrides,
  };

  return { env, assets };
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`${ORIGIN}${path}`, init);
}

function authRequest(
  code: string,
  options: { origin?: string; next?: string } = {}
): Request {
  const body = new URLSearchParams({ code, next: options.next ?? '/discover?mode=word' });
  return request('/__auth', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: options.origin ?? ORIGIN,
    },
    body,
  });
}

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0] ?? '';
}

test('an unauthenticated app request is sent to the login page', async () => {
  const { env, assets } = makeEnv();
  const response = await handleRequest(request('/discover?mode=word'), env);

  assert.equal(response.status, 302);
  assert.match(response.headers.get('location') ?? '', /^\/login\?next=/);
  assert.equal(assets.calls, 0);
});

test('the login page never contains the access code', async () => {
  const { env } = makeEnv();
  const response = await handleRequest(request('/login'), env);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Tester access/);
  assert.match(html, /noindex/);
  assert.equal(html.includes(CODE), false);
  assert.equal(response.headers.get('set-cookie'), null);
});

test('a valid code opens the gate with a hardened cookie and safe next path', async () => {
  const { env, assets } = makeEnv();
  const response = await handleRequest(
    authRequest(CODE, { next: '/discover?mode=phrase' }),
    env
  );

  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/discover?mode=phrase');
  const setCookie = response.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.equal(setCookie.includes(CODE), false);

  const cookie = cookieFrom(response);
  const app = await handleRequest(
    request('/discover?mode=phrase', { headers: { cookie } }),
    env
  );
  assert.equal(app.status, 200);
  assert.equal(await app.text(), 'app shell');
  assert.equal(assets.calls, 1);
});

test('a wrong code is rejected without a cookie', async () => {
  const { env, assets } = makeEnv();
  const response = await handleRequest(authRequest('wrong-code'), env);

  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/login?error=1');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(assets.calls, 0);
});

test('a tampered or expired gate cookie cannot open the app', async () => {
  const { env, assets } = makeEnv();
  for (const cookie of ['dcs_trial_gate=v1.9999999999.bad', 'dcs_trial_gate=v1.1.bad']) {
    const response = await handleRequest(request('/', { headers: { cookie } }), env);
    assert.equal(response.status, 302);
  }
  assert.equal(assets.calls, 0);
});

test('a cross-origin login post is refused', async () => {
  const { env } = makeEnv();
  const response = await handleRequest(
    authRequest(CODE, { origin: 'https://attacker.example' }),
    env
  );

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('set-cookie'), null);
});

test('unsafe next paths fall back to the wizard', async () => {
  const { env } = makeEnv();
  const response = await handleRequest(authRequest(CODE, { next: '//attacker.example' }), env);

  assert.equal(response.headers.get('location'), '/discover?mode=word');
});

test('logout clears the gate cookie', async () => {
  const { env } = makeEnv();
  const response = await handleRequest(request('/__logout'), env);

  assert.equal(response.status, 302);
  assert.match(response.headers.get('set-cookie') ?? '', /Max-Age=0/);
});

test('missing gate configuration fails closed', async () => {
  for (const overrides of [
    { FRONTEND_ACCESS_HASHES: '' },
    { SESSION_SECRET: '' },
    { ASSETS: undefined },
  ] satisfies Array<Partial<Env>>) {
    const { env } = makeEnv(overrides);
    const response = await handleRequest(request('/login'), env);
    assert.equal(response.status, 503);
  }
});
