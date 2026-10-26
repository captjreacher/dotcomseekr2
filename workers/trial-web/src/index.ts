// Tester gate for the hosted guided-discovery trial frontend.
//
// This Worker serves the built Vite app only after a tester access code has been
// accepted. The code is posted in a form body, checked against SHA-256 hashes on
// the server, and never placed in a URL, HTML, source file or log. A signed,
// HttpOnly cookie keeps the gate open for this browser; the app keeps its own
// pseudonymous trial session separately.
//
// This is not a user account system: there is no identity, no password store and
// no billing. It is a removable gate around the isolated trial deployment.

export interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  ASSETS?: Fetcher;
  /** Secret: comma/space separated SHA-256 hashes of tester access codes. */
  FRONTEND_ACCESS_HASHES?: string;
  /** Secret: HMAC key for the signed gate cookie. */
  SESSION_SECRET?: string;
  /** Exact public origin, used to reject cross-origin login posts. */
  APP_ORIGIN?: string;
}

const COOKIE_NAME = 'dcs_trial_gate';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const MAX_CODE_LENGTH = 256;
const LOGIN_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const TEXT_ENCODER = new TextEncoder();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function loginPage(next: string, error = false): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Tester access · DotcomSeekr trial</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b1210; color: #eef7f2; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
    main { width: min(100% - 2rem, 26rem); border: 1px solid #2e4a3f; border-radius: 1rem; padding: 1.5rem; background: #101c17; box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 35%); }
    .eyebrow { margin: 0 0 .4rem; color: #8fd7b5; font-size: .72rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0 0 .6rem; font-size: 1.55rem; line-height: 1.15; }
    p { margin: 0 0 1rem; color: #b9cbc2; }
    label { display: block; margin-bottom: .4rem; font-weight: 650; }
    input { width: 100%; min-height: 2.8rem; border: 1px solid #3f6555; border-radius: .55rem; padding: .65rem .75rem; background: #08110d; color: inherit; font: inherit; }
    input:focus { outline: 2px solid #8fd7b5; outline-offset: 2px; }
    button { width: 100%; min-height: 2.8rem; margin-top: .8rem; border: 0; border-radius: .55rem; background: #b9f5d5; color: #082116; font: inherit; font-weight: 750; cursor: pointer; }
    .error { border-left: 3px solid #f3a28f; padding-left: .75rem; color: #ffd4c9; }
    .note { margin: 1rem 0 0; font-size: .82rem; color: #8fa79b; }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Isolated Cloudflare trial</p>
    <h1>Tester access</h1>
    <p>This build asks the Cloudflare Workers AI trial for naming suggestions. Enter the tester code you were given.</p>
    ${error ? '<p class="error" role="alert">That code was not accepted. Check it and try again.</p>' : ''}
    <form method="post" action="/__auth" id="gate-form">
      <input type="hidden" name="next" value="${escapeHtml(next)}">
      <label for="code">Tester access code</label>
      <input id="code" name="code" type="password" autocomplete="off" spellcheck="false" required autofocus>
      <button type="submit">Enter trial</button>
    </form>
    <p class="note">The code is sent only to this host and stays in this tab. It is never put in the URL.</p>
  </main>
  <script>
    (function () {
      var form = document.getElementById('gate-form');
      var input = document.getElementById('code');
      if (new URLSearchParams(window.location.search).has('error')) {
        try { window.sessionStorage.removeItem('dotcomseekr:discovery:trial-key'); } catch (e) {}
      }
      form.addEventListener('submit', function () {
        var code = input.value.trim();
        if (!code) { input.focus(); return; }
        try { window.sessionStorage.setItem('dotcomseekr:discovery:trial-key', code); } catch (e) {}
      });
    }());
  </script>
</body>
</html>`;
}

function securityHeaders(): Record<string, string> {
  return {
    'cache-control': 'no-store',
    'content-security-policy': LOGIN_CSP,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    robots: 'noindex, nofollow',
  };
}

function redirect(location: string, status = 302, extra: Record<string, string> = {}): Response {
  return new Response(null, {
    status,
    headers: { location, ...securityHeaders(), ...extra },
  });
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', TEXT_ENCODER.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    TEXT_ENCODER.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, TEXT_ENCODER.encode(payload));
  return base64Url(new Uint8Array(signature));
}

function equal(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function hashMatches(candidate: string, configured: readonly string[]): boolean {
  let matched = false;
  for (const hash of configured) {
    if (equal(hash, candidate)) matched = true;
  }
  return matched;
}

async function createSession(secret: string): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.${expires}`;
  return `${payload}.${await sign(secret, payload)}`;
}

async function verifySession(secret: string, token: string): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;

  const expires = Number(parts[1]);
  if (!Number.isInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return false;

  return equal(parts[2], await sign(secret, `${parts[0]}.${parts[1]}`));
}

function readCookie(request: Request): string {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === COOKIE_NAME) {
      return part.slice(separator + 1).trim();
    }
  }
  return '';
}

function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}; Priority=High`;
}

function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Priority=High`;
}

function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/discover?mode=word';
  }
  return value;
}

function configuredHashes(env: Env): string[] {
  return (env.FRONTEND_ACCESS_HASHES ?? '')
    .split(/[\s,]+/)
    .map((hash) => hash.trim().toLowerCase())
    .filter(Boolean);
}

function configured(env: Env): boolean {
  return Boolean(env.SESSION_SECRET && configuredHashes(env).length > 0 && env.ASSETS);
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (!configured(env)) {
    return new Response('Tester access is not configured.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', ...securityHeaders() },
    });
  }

  const url = new URL(request.url);
  if (await verifySession(env.SESSION_SECRET!, readCookie(request))) {
    return redirect('/discover?mode=word');
  }

  return new Response(
    loginPage(safeNext(url.searchParams.get('next')), url.searchParams.has('error')),
    {
      status: url.searchParams.has('error') ? 401 : 200,
      headers: { 'content-type': 'text/html; charset=utf-8', ...securityHeaders() },
    }
  );
}

async function handleAuth(request: Request, env: Env): Promise<Response> {
  if (!configured(env)) {
    return new Response('Tester access is not configured.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', ...securityHeaders() },
    });
  }

  const origin = request.headers.get('origin');
  if (origin && env.APP_ORIGIN && origin !== env.APP_ORIGIN) {
    return new Response('Origin not allowed.', { status: 403, headers: securityHeaders() });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect('/login?error=1', 303);
  }

  const code = String(form.get('code') ?? '').trim();
  const next = safeNext(String(form.get('next') ?? ''));
  if (!code || code.length > MAX_CODE_LENGTH) {
    return redirect('/login?error=1', 303);
  }

  const candidate = await sha256Hex(code);
  if (!hashMatches(candidate, configuredHashes(env))) {
    return redirect('/login?error=1', 303);
  }

  const token = await createSession(env.SESSION_SECRET!);
  return redirect(next, 303, { 'set-cookie': sessionCookie(token) });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'GET' && path === '/login') return handleLogin(request, env);

  if (request.method === 'GET' && path === '/__logout') {
    return redirect('/login', 302, { 'set-cookie': clearSessionCookie() });
  }

  if (request.method === 'POST' && path === '/__auth') return handleAuth(request, env);

  if (!configured(env)) {
    return new Response('Tester access is not configured.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', ...securityHeaders() },
    });
  }

  if (!(await verifySession(env.SESSION_SECRET!, readCookie(request)))) {
    const next = `${url.pathname}${url.search}`;
    return redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  return env.ASSETS!.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
