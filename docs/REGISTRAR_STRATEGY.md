# Registrar Strategy

DotcomSeekr should stay registrar-neutral in the product experience. The backend can choose the best configured provider, but the UI should avoid vendor names and use neutral actions such as:

- Check availability
- Confirm availability
- View registration options

## Current Priority

The staging Edge Function `dotcomseekr-domain-search` resolves providers in this order:

1. Dynadot when `DYNADOT_API_KEY` is present.
2. Namecheap only when every required Namecheap secret is configured.
3. Deterministic mock fallback.

Dynadot is preferred because its API is enabled for the staging account and does not require a fixed outbound IP allowlist. Namecheap remains parked as a fallback because its API requires client IP allowlisting that is awkward for free Supabase Edge Function staging.

## Frontend Contract

Consumer UI should not expose provider or vendor details. Domain cards should show availability and a neutral registration action.

Application code should use:

- `registrationUrl` for links to registration options.

The Supabase database still uses the legacy column:

- `affiliate_url`

Keep writing that column until a schema migration replaces or aliases it. Edge Function responses include `registrationUrl` so frontend code does not need to use the legacy column name.

## Secret Handling

Registrar credentials must stay in Supabase secrets. Do not add provider API keys to frontend env files, static hosting configuration, or client-side code.

Required live Dynadot secret:

- `DYNADOT_API_KEY`

Optional Dynadot secret:

- `DYNADOT_SANDBOX=true|false`

Parked Namecheap fallback secrets:

- `NAMECHEAP_API_USER`
- `NAMECHEAP_API_KEY`
- `NAMECHEAP_USERNAME`
- `NAMECHEAP_CLIENT_IP`
- `NAMECHEAP_SANDBOX=true|false`
- `NAMECHEAP_AFFILIATE_ID`

## Deployment

After changing registrar provider code or secrets:

```bash
supabase functions deploy dotcomseekr-domain-search --project-ref jqfodlzcsgfocyuawzyx
```

If Docker is unavailable:

```bash
supabase functions deploy dotcomseekr-domain-search --project-ref jqfodlzcsgfocyuawzyx --use-api
```

Then run a staging search and confirm the response has `provider: "dynadot"` and `mode: "live"` when `DYNADOT_API_KEY` is configured.
