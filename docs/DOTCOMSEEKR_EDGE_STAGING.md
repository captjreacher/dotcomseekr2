# DotcomSeekr Edge Staging

Staging uses Supabase Edge Functions for the DotcomSeekr API surface while local development can continue to use the existing Fastify API.

## Target

- Web staging URL: `https://dotcomseekr.staging.maximisedai.com`
- Functions base URL: `https://jqfodlzcsgfocyuawzyx.supabase.co/functions/v1`
- Tables used by Edge staging:
  - `dotcomseekr_projects`
  - `dotcomseekr_searches`
  - `dotcomseekr_domain_results`

## Required Secrets

Hosted Supabase Edge Functions provide `SUPABASE_URL`. The functions also need a server-side service role key to write through RLS:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> --project-ref jqfodlzcsgfocyuawzyx
```

Preferred live availability provider:

```bash
supabase secrets set DYNADOT_API_KEY=<VALUE> --project-ref jqfodlzcsgfocyuawzyx
```

Optional fallback live availability provider:

```bash
supabase secrets set NAMECHEAP_API_KEY=<VALUE> --project-ref jqfodlzcsgfocyuawzyx
```

When no live provider key is configured, domain availability is deterministic mock data.

## Deploy Commands

The function blocks in `supabase/config.toml` set `verify_jwt = false` because the current staging frontend calls these functions without user auth.

```bash
supabase functions deploy dotcomseekr-health --project-ref jqfodlzcsgfocyuawzyx
supabase functions deploy dotcomseekr-projects --project-ref jqfodlzcsgfocyuawzyx
supabase functions deploy dotcomseekr-domain-search --project-ref jqfodlzcsgfocyuawzyx
```

If Docker is unavailable:

```bash
supabase functions deploy dotcomseekr-health --project-ref jqfodlzcsgfocyuawzyx --use-api
supabase functions deploy dotcomseekr-projects --project-ref jqfodlzcsgfocyuawzyx --use-api
supabase functions deploy dotcomseekr-domain-search --project-ref jqfodlzcsgfocyuawzyx --use-api
```

## Web Env Values

`apps/web/.env.staging` should contain:

```env
VITE_API_MODE=edge
VITE_SUPABASE_URL=https://jqfodlzcsgfocyuawzyx.supabase.co
VITE_SUPABASE_FUNCTIONS_URL=https://jqfodlzcsgfocyuawzyx.supabase.co/functions/v1
```

Local Fastify development can continue with:

```env
VITE_API_MODE=fastify
VITE_API_URL=http://localhost:3000
```

## Smoke Tests

```bash
curl "https://jqfodlzcsgfocyuawzyx.supabase.co/functions/v1/dotcomseekr-health"
```

```bash
curl --request POST "https://jqfodlzcsgfocyuawzyx.supabase.co/functions/v1/dotcomseekr-projects" \
  --header "Content-Type: application/json" \
  --data '{"name":"Staging smoke","initialPhrase":"brand search","settings":{"maxNodes":50}}'
```

```bash
curl --request POST "https://jqfodlzcsgfocyuawzyx.supabase.co/functions/v1/dotcomseekr-domain-search" \
  --header "Content-Type: application/json" \
  --data '{"projectId":"<PROJECT_ID>","query":"example"}'
```

The browser health smoke test is available at `/health-test`.
