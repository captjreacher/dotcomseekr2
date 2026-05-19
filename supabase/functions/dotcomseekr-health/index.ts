import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getServiceKey() {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeys) return JSON.parse(secretKeys).default as string | undefined;
  return Deno.env.get('SBASE_SERVICE_ROLE_KEY') ?? undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = getServiceKey();

  if (!supabaseUrl || !serviceKey) {
    return json({
      status: 'degraded',
      services: { api: 'ok', database: 'unconfigured' },
      timestamp: new Date().toISOString(),
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase.from('dotcomseekr_projects').select('id').limit(1);

  return json({
    status: error ? 'degraded' : 'ok',
    services: {
      api: 'ok',
      database: error ? 'disconnected' : 'connected',
    },
    timestamp: new Date().toISOString(),
  });
});
