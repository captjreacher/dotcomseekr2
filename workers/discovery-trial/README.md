# Discovery trial Worker (Cloudflare Workers AI)

An isolated provider adapter for guided-discovery naming suggestions. It is not
part of the production Worker and is not deployed by the normal build.

- Endpoint: `POST /v1/variations` (same body/response shape as the Supabase
  `dotcomseekr-discovery` `variations` action, plus `provider`, `trial` metadata).
- Health: `GET /v1/health`.
- Model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` via the `AI` binding, using
  Workers AI JSON Mode.
- Real-word verification: rhymes and affixes are checked against Wiktionary
  (CC BY-SA 4.0) before suggestions are returned. Obsolete spellings, symbols and
  abbreviations are not accepted. The cache is keyed by `SHA-256(term)`.
- Technique boundaries: an affix must be a bound linguistic prefix or suffix,
  not a separate word (so `cranehire`, `craneworks` and `cranepro` are rejected in
  affix rounds). Possessives stay in their own round, and a rhyme must be a
  recognised word whose reason connects it to the selected meaning.
- The hosted frontend at `https://dotcomseekr-discovery-trial-web.mike-f16.workers.dev`
  serves the wizard behind a tester gate; see `../../workers/trial-web/README.md`.
- Empty rounds are explicit: HTTP 200 with `variations: []` and
  `noResults: { reason, message }`, never filler.
- Accounting: one D1 row per provider attempt, including retries and failures.
  Lexical calls, cache hits and latency are recorded separately; the Wikimedia API
  has no usage fee.
- No fallback provider. If Workers AI or lexical verification fails, the request
  fails rather than returning unverified names.

The full findings, measured costs and quality assessment are in
[`../../docs/WORKERS_AI_TRIAL.md`](../../docs/WORKERS_AI_TRIAL.md).

## Configuration

`wrangler.jsonc` binds:

| Binding                                              | Purpose                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `AI`                                                 | Workers AI                                                               |
| `USAGE_DB`                                           | D1 database `dotcomseekr-discovery-trial` (usage + hashed lexical cache) |
| `TRIAL_KEY_HASHES`                                   | **secret**: comma-separated SHA-256 hashes of tester codes               |
| `TRIAL_PROVIDER`                                     | must be `workers-ai`                                                     |
| `TRIAL_MODEL`                                        | exact model id                                                           |
| `TRIAL_ALLOWED_ORIGINS`                              | comma-separated browser origins allowed by CORS                          |
| `TRIAL_SESSION_*`, `TRIAL_GLOBAL_*`, `TRIAL_TOTAL_*` | daily/session/overall allowances                                         |

Defaults are deliberately low: 10 turns/day and 18 provider calls/day per
session; 80 turns/day and 100 calls/day shared; 150 turns, 250 calls and 400,000
tokens overall. All of them reset or stop rather than enabling overage. Pass 1
exhausted all 80 shared daily naming turns; pass 2 did not raise the caps, so its
fresh matrix could not run before the next UTC reset.

## Local commands

From the repository root:

```bash
# Typecheck
node node_modules/typescript/bin/tsc -p workers/discovery-trial/tsconfig.json

# Unit + handler tests (Node 24 can run these TS files directly)
node --test "workers/discovery-trial/test/**/*.test.ts"

# Create/initialise the isolated D1 database (once)
npx wrangler d1 create dotcomseekr-discovery-trial \
  --config workers/discovery-trial/wrangler.jsonc
npx wrangler d1 execute dotcomseekr-discovery-trial --remote \
  --file=workers/discovery-trial/migrations/0001_usage.sql \
  --config workers/discovery-trial/wrangler.jsonc
npx wrangler d1 execute dotcomseekr-discovery-trial --remote \
  --file=workers/discovery-trial/migrations/0002_quality.sql \
  --config workers/discovery-trial/wrangler.jsonc

# Secret: hashes of the tester codes, never the codes
npx wrangler secret put TRIAL_KEY_HASHES \
  --config workers/discovery-trial/wrangler.jsonc

# Deploy the isolated Worker (workers.dev only; no custom domain)
npx wrangler deploy --config workers/discovery-trial/wrangler.jsonc
```

## Exercising the wizard against the trial

The normal build still calls Supabase. Only a build with
`VITE_DISCOVERY_TRIAL_URL` set uses this Worker, and the tester still has to
enter an access code in the Explore step.

```bash
cd apps/web
VITE_DISCOVERY_TRIAL_URL=https://dotcomseekr-discovery-trial.mike-f16.workers.dev \
  npm run dev -- --port 5173
```

The default `TRIAL_ALLOWED_ORIGINS` allows `http://localhost:5173`,
`http://localhost:4173` and the hosted trial frontend. Add any other preview
origin explicitly.

The reproducible matrix runner reads a tester code from
`.trial/access-keys.local.txt` (gitignored) or `TRIAL_KEY`:

```bash
# Full 4-case / 20-turn matrix
node workers/discovery-trial/scripts/trial-matrix.mjs

# Smaller 2-case / 10-turn pass (one word, one phrase)
TRIAL_MATRIX_CASES=crane-machine,common-ground \
  node workers/discovery-trial/scripts/trial-matrix.mjs
```

It writes `docs/workers-ai-trial/results-current.json` by default, so a new run
never mixes with the archived `results.json`. Each result records the local
source SHA, health metadata, model, deployment and prompt/validator/technique
versions. Single-word hyphens are expected to be refused before any provider
call. The summary includes lexical calls/cache hits, empty-round reasons and a
check that the previous failures (`drane`, `grane`, `krane`, `blueflorit`,
`herswift`, `uncommonground`) did not leak into accepted suggestions.

## Reading usage

```bash
npx wrangler d1 execute dotcomseekr-discovery-trial --remote \
  --config workers/discovery-trial/wrangler.jsonc \
  --command "SELECT technique, mode, outcome, COUNT(*) AS n,
                    SUM(input_tokens) AS input_tokens,
                    SUM(output_tokens) AS output_tokens,
                    SUM(billed_units) AS neurons,
                    SUM(estimated_cost_usd) AS cost,
                    SUM(accepted_count) AS accepted,
                    SUM(rejected_count) AS rejected,
                    SUM(lexical_calls) AS lexical_calls,
                    SUM(lexical_cache_hits) AS lexical_cache_hits
               FROM generation_attempts
              GROUP BY technique, mode, outcome;"
```

`billed_units` is the actual `usage.neurons` returned by Workers AI.
`estimated_cost_usd` is measured tokens × the official prices recorded in
`pricing.ts`; `pricing_source` and `pricing_date` are stored on each row.

## Security and teardown

- Tester codes are bearer tokens. Only their hashes are configured; rotate the
  secret if a code leaks.
- Sessions are random browser UUIDs; only their SHA-256 is stored.
- No brand commentary, brand input or credential is written to D1. The lexical
  cache stores only `SHA-256(term)`, not the word.
- Wiktionary lookups send the candidate word to Wikimedia with an identifiable
  `User-Agent`; the API has no fee. If it is unavailable, the round fails with
  `lexical_unavailable` rather than showing unverified names.
- The Worker URL is public but requires a valid code and an allowlisted origin.
- Stop access by removing/rotating `TRIAL_KEY_HASHES` or deleting the Worker.
  Delete the D1 database separately if the usage data is no longer needed.
