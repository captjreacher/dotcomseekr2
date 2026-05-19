import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'http://localhost:5173',
  'https://dotcomseekr.staging.maximisedai.com',
]);
const tlds = ['com', 'net', 'org', 'ai'];

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

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 48);
}

function hash(value: string) {
  let total = 0;
  for (let i = 0; i < value.length; i++) {
    total = (total * 31 + value.charCodeAt(i)) >>> 0;
  }
  return total;
}

function fakeAvailability(domain: string) {
  const value = hash(domain);
  const available = value % 4 !== 0;
  const premium = available && value % 9 === 0;

  return {
    available,
    price: available ? (premium ? 499 : domain.endsWith('.ai') ? 79 : 14) : null,
    provider: 'mock',
    metadata: {
      premium,
      deterministic: true,
      providerConfigured: Boolean(Deno.env.get('NAMECHEAP_API_KEY')),
    },
  };
}

async function latestResults(supabase: ReturnType<typeof createClient>, projectId: string) {
  const { data: search, error: searchError } = await supabase
    .from('dotcomseekr_searches')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (searchError) throw new Error(searchError.message);
  if (!search) return { search: null, results: [] };

  const { data: results, error: resultsError } = await supabase
    .from('dotcomseekr_domain_results')
    .select('*')
    .eq('search_id', search.id)
    .order('created_at', { ascending: true });

  if (resultsError) throw new Error(resultsError.message);
  return { search, results: results ?? [] };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(req, { ok: true });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const projectId = String(body.projectId ?? body.project_id ?? '').trim();
    const query = String(body.query ?? '').trim();

    if (!projectId) return json(req, { error: 'projectId is required' }, 400);

    const supabase = getClient();

    if (!query) {
      const data = await latestResults(supabase, projectId);
      return json(req, data);
    }

    const label = normalizeLabel(query);
    if (!label) return json(req, { error: 'query must contain a valid domain label' }, 400);

    const { data: search, error: searchError } = await supabase
      .from('dotcomseekr_searches')
      .insert({
        project_id: projectId,
        query,
        tlds,
        provider: 'mock',
        status: 'completed',
        metadata: {
          source: 'dotcomseekr-edge',
          providerConfigured: Boolean(Deno.env.get('NAMECHEAP_API_KEY')),
        },
      })
      .select()
      .single();

    if (searchError) return json(req, { error: searchError.message }, 500);

    const rows = tlds.map((tld) => {
      const domain = `${label}.${tld}`;
      const availability = fakeAvailability(domain);

      return {
        search_id: search.id,
        domain,
        available: availability.available,
        price: availability.price,
        currency: 'USD',
        provider: availability.provider,
        affiliate_url: null,
        metadata: availability.metadata,
      };
    });

    const { data: results, error: resultsError } = await supabase
      .from('dotcomseekr_domain_results')
      .insert(rows)
      .select();

    if (resultsError) return json(req, { error: resultsError.message }, 500);

    return json(req, {
      search,
      results: results ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return json(req, { error: message }, 500);
  }
});
