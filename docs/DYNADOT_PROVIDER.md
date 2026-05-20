# Dynadot Provider

DotcomSeekr staging uses Dynadot as the preferred live availability provider from the Supabase Edge Function `dotcomseekr-domain-search`. Dynadot credentials stay in Supabase function secrets and are never exposed to the frontend.

## Setup

1. Create or sign in to a Dynadot account.
2. Enable API access and create an API key in the Dynadot account settings.
3. Store the API key as a Supabase Edge Function secret.
4. Deploy `dotcomseekr-domain-search`.
5. Run a staging search and confirm the response has `provider: "dynadot"` and `mode: "live"`.

## Required Secrets

Required for Dynadot live checks:

- `DYNADOT_API_KEY`

Optional:

- `DYNADOT_SANDBOX=true|false`

The function also needs the existing database secret:

- `SUPABASE_SERVICE_ROLE_KEY`

Do not add Dynadot secrets to `apps/web` env files or any frontend deployment provider.

## Supabase Commands

```bash
supabase secrets set DYNADOT_API_KEY=<api-key> --project-ref jqfodlzcsgfocyuawzyx
```

Optional sandbox mode:

```bash
supabase secrets set DYNADOT_SANDBOX=true --project-ref jqfodlzcsgfocyuawzyx
```

Deploy after setting or changing secrets:

```bash
supabase functions deploy dotcomseekr-domain-search --project-ref jqfodlzcsgfocyuawzyx
```

If Docker is unavailable:

```bash
supabase functions deploy dotcomseekr-domain-search --project-ref jqfodlzcsgfocyuawzyx --use-api
```

## API Docs Reference

Dynadot API documentation:

- `https://www.dynadot.com/domain/api-commands`

The Edge Function calls the XML API `search` command with:

- `key`
- `command=search`
- `domain0`
- `show_price=1`
- `currency=USD`

Live endpoint:

- `https://api.dynadot.com/api3.xml`

Sandbox endpoint:

- `https://api-sandbox.dynadot.com/api3.xml`

## Provider Priority

The provider selection order is:

1. Dynadot, when `DYNADOT_API_KEY` is configured.
2. Namecheap, when all Namecheap secrets are configured.
3. Deterministic mock fallback.

Dynadot is expected to run in live mode for free staging environments unless `DYNADOT_SANDBOX=true` is explicitly set.

## Response Shape

New searches return top-level provider metadata plus database rows:

```json
{
  "provider": "dynadot",
  "mode": "live",
  "checkedAt": "2026-05-20T00:00:00.000Z",
  "results": []
}
```

For backwards compatibility the response also includes `search` and `providerMetadata`. Domain result rows expose the legacy database column `affiliate_url` plus the registrar-neutral `registrationUrl` field used by application code.

Each persisted domain result stores:

- `provider = "dynadot"`
- `affiliate_url = <registration option URL>` for the legacy database schema
- `metadata.mode = "live"`
- `metadata.checkedAt`
- `metadata.registrationUrl`

## Staging Notes

- No frontend provider-specific changes are required.
- The UI should use neutral wording such as "Check availability" and "View registration options".
- The UI should continue to treat provider details as backend metadata.
- Dynadot failures fall through to the next configured provider or mock fallback.
- Fallback responses include `fallbackReason` in metadata for debugging.
- Dynadot regular accounts are documented as one searched domain per command, so staging sends sequential single-domain checks for the configured TLD set.

## Defensive Handling

The Edge Function handles:

- Invalid API keys or denied API access.
- Malformed XML or omitted domain results.
- Rate limiting.
- Unavailable registrar endpoints.

In these cases it preserves mock fallback behavior so staging remains usable.

## Free-Tier Considerations

Dynadot does not require the same client IP whitelist setup that blocked Namecheap staging. Keep request volume low on free staging, because registrar APIs can still rate limit or suspend access for excessive automated checks. DotcomSeekr currently checks only the configured TLD set for each user search.
