# Namecheap Provider

DotcomSeekr staging can check domain availability through Namecheap from the Supabase Edge Function `dotcomseekr-domain-search`. API keys stay inside Supabase function secrets and are never sent to the GitHub Pages frontend.

## Required Secrets

Set all of these to enable Namecheap:

- `NAMECHEAP_API_USER`
- `NAMECHEAP_API_KEY`
- `NAMECHEAP_USERNAME`
- `NAMECHEAP_CLIENT_IP`
- `NAMECHEAP_SANDBOX=true|false`

Optional:

- `NAMECHEAP_AFFILIATE_ID`

The function also needs the existing database secret:

- `SUPABASE_SERVICE_ROLE_KEY`

## Supabase Commands

```bash
supabase secrets set NAMECHEAP_API_USER=<api-user> --project-ref jqfodlzcsgfocyuawzyx
supabase secrets set NAMECHEAP_API_KEY=<api-key> --project-ref jqfodlzcsgfocyuawzyx
supabase secrets set NAMECHEAP_USERNAME=<username> --project-ref jqfodlzcsgfocyuawzyx
supabase secrets set NAMECHEAP_CLIENT_IP=<whitelisted-ip> --project-ref jqfodlzcsgfocyuawzyx
supabase secrets set NAMECHEAP_SANDBOX=true --project-ref jqfodlzcsgfocyuawzyx
supabase secrets set NAMECHEAP_AFFILIATE_ID=<affiliate-id> --project-ref jqfodlzcsgfocyuawzyx
```

Deploy after setting or changing secrets:

```bash
supabase functions deploy dotcomseekr-domain-search --project-ref jqfodlzcsgfocyuawzyx
```

## Sandbox And Live

- `NAMECHEAP_SANDBOX=true` uses `https://api.sandbox.namecheap.com/xml.response`.
- `NAMECHEAP_SANDBOX=false` uses `https://api.namecheap.com/xml.response`.
- Both modes call `namecheap.domains.check` with a comma-separated `DomainList`.

## IP Whitelist Caveat

Namecheap requires API requests to come from a whitelisted client IP. Supabase Edge Functions may run from infrastructure IPs that are not stable unless your deployment/network setup guarantees egress. If Namecheap rejects the request because of IP or credentials, the function falls back to deterministic mock availability and returns `fallbackReason` in provider metadata.

## Response Metadata

Each search response includes:

```json
{
  "provider": {
    "provider": "namecheap",
    "mode": "sandbox",
    "checkedAt": "2026-05-19T00:00:00.000Z"
  }
}
```

Mock fallback includes:

```json
{
  "provider": {
    "provider": "mock",
    "mode": "mock",
    "checkedAt": "2026-05-19T00:00:00.000Z",
    "fallbackReason": "Missing Namecheap env vars: apiKey"
  }
}
```
