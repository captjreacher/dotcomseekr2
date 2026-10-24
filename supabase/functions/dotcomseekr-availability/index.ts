// Single exact-domain availability check for the Quick Check flow.
//
// Unlike `dotcomseekr-domain-search` (which generates alternative names and
// checks them in bulk for a project), this function checks exactly ONE domain
// the user typed. It reuses the shared registrar provider chain so provider
// selection and credentials stay in `_shared/registrar.ts`.
//
// Honesty contract: an availability state is only ever returned for a real
// provider response. When no live provider is configured, or the provider
// fails/rate-limits/returns malformed data, the shared chain degrades to the
// deterministic mock provider; this function reports that as `status: "unknown"`
// with an error rather than presenting mock data as a real availability result.
// The web client maps `unknown` (or a mock provider) to its error state.

import { createPreferredProvider } from '../_shared/registrar.ts';
import { isValidDomainName } from '../_shared/validation.ts';

const allowedOrigins = new Set([
  'http://localhost:5173',
  'https://dotcomseekr.staging.maximisedai.com',
]);

// Kept in sync with the bulk search function and the shared web availability
// list. Unsupported TLDs are rejected before any provider call.
const allowedTlds = new Set(['com', 'ai', 'io', 'co', 'net', 'org']);

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';

  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
}

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

export function normalizeDomainInput(raw: unknown): { domain: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'Enter a domain to check.' };

  let value = raw.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, '');
  value = value.split(/[/?#]/)[0] ?? '';
  value = value.replace(/\.$/, '');

  if (!value) return { error: 'Enter a domain to check.' };
  if (!value.includes('.')) return { error: 'Use a full domain, like agent.com.' };

  const labels = value.split('.');
  if (labels.length !== 2) {
    return { error: 'Check one domain at a time, like agent.com.' };
  }

  const [label, tld] = labels;
  if (!allowedTlds.has(tld)) {
    return { error: `We can only check .${[...allowedTlds].join(', .')} right now.` };
  }
  if (!isValidDomainName(label)) {
    return { error: 'That domain is not valid.' };
  }

  return { domain: `${label}.${tld}` };
}

function isPurchasableStatus(status: string) {
  return status === 'available' || status === 'premium';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(req, { ok: true });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const parsed = normalizeDomainInput(body?.domain);

    if ('error' in parsed) {
      return json(req, { status: 'unknown', error: parsed.error }, 400);
    }

    const domain = parsed.domain;
    const provider = createPreferredProvider();
    const results = await provider.checkDomains([domain]);
    const result = results[0];
    const checkedAt = result?.checkedAt ?? new Date().toISOString();

    // No live provider (mock fallback) or a missing result is never reported as
    // a real availability answer.
    if (!result || result.provider === 'mock' || result.mode === 'mock') {
      return json(req, {
        domain,
        status: 'unknown',
        error: 'Live availability could not be established.',
        provider: result?.provider ?? 'mock',
        mode: result?.mode ?? 'mock',
        fallbackReason: result?.fallbackReason,
        checkedAt,
      });
    }

    const premium = result.metadata?.premium === true;
    const status = !result.available ? 'taken' : premium ? 'premium' : 'available';

    return json(req, {
      domain,
      status,
      price: result.available ? result.price : null,
      currency: result.currency,
      registrationUrl: isPurchasableStatus(status) ? result.registrationUrl || null : null,
      provider: result.provider,
      mode: result.mode,
      checkedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return json(req, { status: 'unknown', error: message }, 500);
  }
});
