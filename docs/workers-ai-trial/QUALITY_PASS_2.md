# Workers AI trial — pass 2: technique boundaries and hosted tester frontend

Date: **2026-10-26**. Draft PR: **#7** (`trial/workers-ai-guided-discovery`), based on
**#6** (`feat/guided-discovery`). Production is unchanged; nothing was merged.

This report supersedes the technique rules in the pass-1 findings
([`../WORKERS_AI_TRIAL.md`](../WORKERS_AI_TRIAL.md)). Pass-1 measurements and quality
judgements are kept separate below and are never presented as measurements of the
pass-2 prompt.

## 1. What changed

### Technique boundaries

- **Affixes are bound linguistic affixes.** A separate word attached to the brand is
  a compound, not an affix. Affix rounds now reject `cranehire`, `craneworks` and
  `cranepro`, and the same rule rejects `cranelift`, `craneplus`, `cranemax` and
  `industrialscrane`. Valid bound forms such as `reclean` and `cleanable` still pass.
  Possessives remain a separate technique, so `mycrane` is rejected in an affix round.
- **Rhymes must be recognised words and plausible for the brand.** The replaced word
  (not the joined domain phrase) is checked against Wiktionary. A reason that only
  says “rhymes with …” is rejected when the brand has a selected meaning; the reason
  must connect the rhyme to that meaning or commentary.
- **No forced five.** The prompt asks for fewer or none when suitable options are
  scarce. The validator caps a round at five and the UI explains an empty round
  instead of filling it.
- **The brand anchor is unchanged.** Every request still carries the original brand,
  selected meaning and commentary, and each technique is limited to what it may
  modify. No other technique is used to fill a weak round.

The prompt and technique rules are version **`2026-10-26.2`**; the validator is
**`2026-10-26.3`** after the recognised-compound rule (`apps/web/src/lib/discovery/versions.ts`).
The deployed health endpoint reports all three versions alongside the model.

### Hosted frontend

The wizard is served at:

**https://dotcomseekr-discovery-trial-web.mike-f16.workers.dev**

It is a separate Worker from the trial API and from production. `/login` accepts a
tester code in a POST body; the Worker checks its SHA-256 against a secret and sets a
signed, HttpOnly cookie for 12 hours. Every app route requires that cookie. The code
is never placed in a URL, source file or log. The login page keeps the accepted code
in this tab's `sessionStorage` so the wizard can send it to the trial API. A new tab
asks for a code again.

Use one of the tester codes already issued for the API. The local, gitignored file
`.trial/access-keys.local.txt` holds them; do not copy a code into a URL, a commit or
a report. Rotate `FRONTEND_ACCESS_HASHES` and `TRIAL_KEY_HASHES` together if a code
is exposed. `/__logout` clears the gate cookie.

## 2. Deployment and version evidence

| Item                           | Value                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| API Worker                     | `dotcomseekr-discovery-trial`                                                         |
| API URL                        | https://dotcomseekr-discovery-trial.mike-f16.workers.dev                              |
| API version ID                 | `e772ce43-d3d2-4238-a91e-5eb7566111f3`                                                |
| Deployed source commit         | `a38d7d50fb14483a0591bb0cb3542b00a3de7f17`                                            |
| Deployment label               | `trial-20261026T090120Z-a38d7d5`                                                      |
| Frontend Worker                | `dotcomseekr-discovery-trial-web`                                                     |
| Frontend version ID            | `4a79045c-26e0-43a9-957b-192500fa1e42`                                                |
| Model                          | `@cf/meta/llama-3.3-70b-instruct-fp8-fast`                                            |
| Prompt / validator / technique | `2026-10-26.2` / `2026-10-26.3` / `2026-10-26.2`                                      |
| Pricing source                 | https://developers.cloudflare.com/workers-ai/platform/pricing/ (retrieved 2026-10-26) |

The deployment label and source SHA are returned by `/v1/health`, so a later matrix
can record the exact deployed code rather than the local working tree. The report
commit itself is documentation-only and does not change the deployed Worker.

## 3. Live evidence (not fixtures)

Checked against the deployed URLs on 2026-10-26:

- `/v1/health` returned `status: ok`, the Workers AI provider, the exact model above,
  source SHA `a38d7d5…`, prompt/validator/technique `2026-10-26.2` / `2026-10-26.3` /
  `2026-10-26.2`, and the pricing source/date.
- The hosted frontend sent an unauthenticated request to `/login?next=%2F` (302).
  The login page returned 200 HTML with a code input and a restrictive CSP.
- A valid tester code posted to `/__auth` returned 303 to
  `/discover?mode=word` and a cookie with `HttpOnly; Secure; SameSite=Lax; Max-Age=43200`.
  The gated `/discover?mode=word` then returned 200 HTML; the JS and CSS assets
  returned 200 with the correct content types.
- The built bundle contains the trial API URL and keeps the Supabase functions URL
  for dictionary and availability calls.
- A wrong gate code returned 303 to `/login?error=1`. A cross-origin API request
  from `https://evil.example` returned 403.
- CORS preflight from the hosted frontend origin returned 204 with that exact
  `Access-Control-Allow-Origin`.
- An authenticated POST from the hosted frontend origin reached the API and was
  refused by the **existing** limit, not by authentication:

  ```json
  {
    "code": "trial_limit",
    "limit": "global_turns_per_day",
    "error": "The shared trial has reached its daily naming-turn allowance. It resets at 00:00 UTC.",
    "providerCalls": 0
  }
  ```

  HTTP 429, `providerCalls: 0`: no model call and no new usage row.

No live pass-2 generation was possible today. The trial had already used **80/80**
shared daily naming turns before this deployment. The caps were not raised.

## 4. Quality findings

### Pass-2 live quality: not measured

The fresh matrix could not start because the shared daily **turn** allowance was
exhausted (80/80). Reporting a pass-2 relevance score from the pass-1 outputs would
mix archived and current data, so this report makes no live pass-2 quality claim.

The reproducible runner is `workers/discovery-trial/scripts/trial-matrix.mjs`. Use
`TRIAL_MATRIX_CASES=crane-machine,common-ground` for a 10-turn pass (one ambiguous
word and one ambiguous phrase across all five techniques) after the UTC reset. It
writes `docs/workers-ai-trial/results-current.json` and records source SHA,
deployment, model and prompt/validator/technique versions. The full four-case pass is
20 turns and should only run when the daily and overall allowances permit it.

### Pass-2 validator boundaries: fixture evidence

These are deterministic tests of the current validator, not model-quality evidence.
All 134 web tests pass.

- `cranehire`, `craneworks`, `cranepro`, `cranelift`, `craneplus`, `cranemax` and
  `industrialscrane` are rejected because the added piece is a separate recognised
  word, not a bound affix. The test asserts the underlying rule across several
  examples rather than only the three named failures, including a case where the
  joined compound is itself in the recognised set.
- `getclean` is rejected for the same reason; `cleanable` and `reclean` are accepted.
- `mycrane` in an affix round is rejected as a possessive; `craneable` passes.
- `commonround` with the reason “round rhymes with ground” is rejected even though it
  is a real rhyme. The same suggestion is accepted when the reason connects “round”
  to shared agreement or a cycle of agreement.
- `swiftier` is rejected as a grammatical ending that is not a real word;
  `swiftish` is accepted as a productive bound suffix; `swiftly`, `swiftness` and
  `swiftify` remain accepted.
- Empty rounds are explicit `variations: []` responses with a reason and message;
  the browser shows the server message. No invented-spelling mode was added.

### Archived pass-1 quality (clearly historical)

The pass-1 matrix produced 78 accepted suggestions across 20 provider-backed
attempts; about 50 were judged useful in context. Technical compliance was strong,
but semantic fit was the limiting factor. In particular, `commonround` was the only
`common ground` rhyme judged useful; `commonmound` pulled toward soil, `commonfound`
read ungrammatically and `commonwound` was negative or weakly positive depending on
the model's own reason.

Pass 1 also accepted `cranelift`, `craneplus` and `cranemax` in the crane affix
round, and the blind proxy comparison considered `cranehire`, `craneworks` and
`cranepro` more readable than the trial's compound answers. Those outputs predate the
pass-2 boundary. The new rule deliberately rejects them, which should reduce affix
breadth. Whether the remaining bound affixes are useful is exactly what the fresh
matrix must measure; this report does not claim they are better or worse.

Archived empty-round finding: one `common ground` hyphen round returned an empty
model response and was reported as `empty_model_response` with no filler. That is a
pass-1 observation, not a pass-2 live result.

## 5. Usage and remaining allowance

### Cumulative trial usage (all rows to date, before pass-2 generation)

| Metric                                |                                        Value |
| ------------------------------------- | -------------------------------------------: |
| Provider attempts                     |                                           80 |
| Successful attempts                   |                                           67 |
| Validation rejections                 |                                           13 |
| Provider errors / retries             |                                        0 / 0 |
| Input tokens                          | 27,095 (success) + 5,036 (rejected) = 32,131 |
| Output tokens                         |   8,388 (success) + 1,313 (rejected) = 9,701 |
| Total tokens                          |                                       41,832 |
| Billed usage (actual `usage.neurons`) |                             2,843.68 Neurons |
| Estimated cost                        |                                    $0.031271 |
| Average provider latency              |                                     3,910 ms |
| Accepted suggestions                  |                                           78 |
| Candidates rejected by validation     |                                           62 |
| Lexical-service calls / cache hits    |                                      60 / 14 |
| Lexical-service cost                  |                        $0.00 (Wikimedia API) |

These rows predate the pass-2 prompt. They are useful for the trial's actual spend and
for the remaining-allowance arithmetic, not as a pass-2 per-turn estimate.

### Remaining allowance

| Limit                                   |              Used |                       Remaining |
| --------------------------------------- | ----------------: | ------------------------------: |
| Shared daily naming turns               |           80 / 80 |  **0 today** (resets 00:00 UTC) |
| Shared daily provider calls             |          80 / 100 | 20 today, but turns block first |
| Overall naming turns                    |          80 / 150 |                              70 |
| Overall provider calls                  |          80 / 250 |                             170 |
| Overall tokens                          |  41,832 / 400,000 |                         358,168 |
| Daily free Neurons (account allocation) | 2,843.68 / 10,000 |                        7,156.32 |

At the pass-1 average of **44.86 Neurons per provider turn**, the remaining daily free
allocation is about **159 turns**, but the trial's own **70-turn overall cap** is the
binding limit, and today's shared cap is already exhausted. This is arithmetic from
the archived measured average, not a pass-2 measurement.

Projected cost at the same archived average:

| Scale       | Estimated cost |
| ----------- | -------------: |
| 100 turns   |    **$0.0493** |
| 1,000 turns |     **$0.493** |

These projections are not a pass-2 estimate: the new prompt is longer and the
validator now rejects more affix candidates, so tokens per turn and useful
suggestions per turn may change.

### Uncertainty

- The 10,000-Neuron daily allocation is shared across the Cloudflare account.
  Account-wide consumption is not exposed by the tooling used; only per-request
  billed Neurons are actual.
- Billing alerts are notifications, not hard spending caps. None were relied on.
  No paid overage was enabled and no plan change was made.
- The trial's limit checks are check-then-insert and can overshoot slightly under
  concurrent requests. This is a bounded trial, not billing-grade quota enforcement.
- No OpenAI fallback or BYOK/login/billing work was added.

## 6. Checks run

Automated (all pass):

```bash
node --test "apps/web/src/**/*.test.ts"                 # 134/134
node --test "workers/discovery-trial/test/**/*.test.ts" \
  "workers/trial-web/test/**/*.test.ts"                 # 32/32
npx --no-install tsc -p apps/web/tsconfig.json --noEmit
npx --no-install tsc -p workers/discovery-trial/tsconfig.json --noEmit
npx --no-install tsc -p workers/trial-web/tsconfig.json --noEmit
```

The Worker tests include a fake AI binding and fake lexical verifier, so they are
fixtures. The live checks in section 3 are the only live evidence for this pass.

PR checks: GitGuardian passed and the Cloudflare Workers Builds branch **preview**
passed. `wrangler deployments list --name dotcomseekr2` still shows the latest
production deployment on 2026-10-24, before this branch was pushed; the push did not
release production.

Not run:

- A pass-2 live quality matrix: blocked by 80/80 daily turns; caps unchanged.
- A pass-2 live empty-round UI click: same block. The response contract and UI notice
  are covered by tests.
- Deno typecheck or deployment of the Supabase function: Deno is not installed; the
  production function was not deployed.
- Any production deployment, merge, OpenAI comparison, login, billing or BYOK.

## 7. Merge order

1. Review and merge **#6** (`feat/guided-discovery`) first.
2. Rebase **#7** on the merged guided-discovery commit if #6 changes.
3. Merge **#7** after #6. Its diff is against guided discovery, so it contains only
   the trial adapter, validator, tests, hosted trial frontend and reports.
4. Production stays unchanged until someone deliberately promotes the trial.

## 8. Access and teardown

Access: open the frontend URL, enter an issued tester code at `/login`, and keep the
tab open. The code is not in the URL; the gate cookie lasts 12 hours. The wizard
sends the code and a pseudonymous per-tab session to the API, where usage is recorded.

Teardown of the hosted frontend (does not touch production):

```bash
npx wrangler delete --config workers/trial-web/wrangler.jsonc
```

Teardown of the API and its usage database remains as documented in the pass-1
report. Rotate or remove `FRONTEND_ACCESS_HASHES` to stop gate access without deleting
the Worker.
