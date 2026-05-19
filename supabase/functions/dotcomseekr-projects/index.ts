import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'http://localhost:5173',
  'https://dotcomseekr.staging.maximisedai.com',
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';

  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
}

function json(req: Request, body: Record<string, unknown> | unknown[], status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

function getServiceKey() {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeys) return JSON.parse(secretKeys).default as string | undefined;
  return Deno.env.get('SBASE_SERVICE_ROLE_KEY') ?? undefined;
}

function getClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = getServiceKey();

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service credentials are not configured');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(req, { ok: true });
  if (!['GET', 'POST'].includes(req.method)) {
    return json(req, { error: 'Method not allowed' }, 405);
  }

  try {
    const supabase = getClient();

    if (req.method === 'GET') {
      const projectId = new URL(req.url).searchParams.get('id');
      const query = supabase.from('dotcomseekr_projects').select('*');

      const { data, error } = projectId
        ? await query.eq('id', projectId).single()
        : await query.order('created_at', { ascending: false });

      if (error) return json(req, { error: error.message }, projectId ? 404 : 500);
      return json(req, data ?? []);
    }

    const body = await req.json();
    const name = String(body.name ?? '').trim();
    const initialPhrase = String(body.initialPhrase ?? body.initial_phrase ?? '').trim();

    if (!name) return json(req, { error: 'name is required' }, 400);

    const { data, error } = await supabase
      .from('dotcomseekr_projects')
      .insert({
        name,
        description: body.description ?? null,
        status: 'active',
        metadata: {
          initialPhrase,
          settings: body.settings ?? {},
          source: 'dotcomseekr-edge',
        },
      })
      .select()
      .single();

    if (error) return json(req, { error: error.message }, 500);
    return json(req, data, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return json(req, { error: message }, 500);
  }
});
