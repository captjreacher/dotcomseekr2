// HTTP plumbing shared by every DotcomSeekr edge function.
//
// Kept in one place so CORS, JSON responses, the service client and TLD
// validation cannot drift between the search and discovery endpoints.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'http://localhost:5173',
  'https://dotcomseekr.staging.maximisedai.com',
]);

export const allowedTlds = new Set(['com', 'ai', 'io', 'co', 'net', 'org']);

export function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';

  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
}

export function json(req: Request, body: Record<string, unknown> | unknown[], status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

export function getServiceKey() {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeys) return JSON.parse(secretKeys).default as string | undefined;
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? undefined;
}

export function getClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = getServiceKey();

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service credentials are not configured');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function parseTlds(rawTlds: unknown) {
  const requested = Array.isArray(rawTlds)
    ? rawTlds
    : typeof rawTlds === 'string'
      ? rawTlds.split(',')
      : [];

  const clean = requested
    .map((value) => String(value).toLowerCase().replace(/^\./, '').trim())
    .filter((value) => allowedTlds.has(value));

  return [...new Set(clean)].slice(0, 6);
}
