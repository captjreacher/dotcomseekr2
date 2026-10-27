# Workers AI trial — pass 2: live matrix, technique boundaries and hosted tester frontend

Date: **2026-10-27** (matrix run after the UTC reset). Draft PR: **#7**
(`trial/workers-ai-guided-discovery`), based on **#6** (`feat/guided-discovery`).
Production is unchanged; nothing was merged.

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

The deployment label and source SHA are returned by `/v1/health`, so the matrix
records the exact deployed code rather than the local working tree. The local report
commit (`a53509d…`) contains documentation only; the deployed Worker is still
`a38d7d5…`. `sourceShaMatchesDeployment: false` in the raw results is therefore
expected and does not mean the matrix tested a different Worker.

## 3. Live evidence (not fixtures)

Checked against the deployed URLs on 2026-10-27:

- `/v1/health` at 00:03 UTC returned `status: ok`, the Workers AI provider, the exact
  model above, source SHA `a38d7d5…`, deployment
  `trial-20261026T090120Z-a38d7d5`, prompt/validator/technique
  `2026-10-26.2` / `2026-10-26.3` / `2026-10-26.2`, and the pricing source/date.
- The hosted frontend `/login` returned 200 HTML. `/` returned 302 to
  `/login?next=%2F`; gated `/discover?mode=word` returned 302 to the login page.
  A valid tester code posted to `/__auth` returned 303 to
  `/discover?mode=word`; the gated route then returned 200 HTML.
- The earlier gate checks still apply: a wrong code returns 303 to
  `/login?error=1`; a cross-origin API request from `https://evil.example` returns
  403; the hosted frontend origin gets a 204 preflight with the exact
  `Access-Control-Allow-Origin`; unauthenticated API requests are rejected.
- The matrix below made real requests to the deployed API after the UTC reset, not
  fixtures. One single-word hyphen request was refused by the API before the provider
  call, as designed.

## 4. Live pass-2 quality matrix

### Run identity and an operational error

The planned pass was two ambiguous cases (`crane-machine`, `common-ground`) across
five techniques: 10 user requests, with the single-word hyphen request refused before
the provider call.

**Two runs executed concurrently by mistake.** A scheduled runner started at
`00:00:15 UTC`; a foreground runner started at `00:00:20 UTC`. Both used the same
deployed Worker, model and prompt/validator, and both requested the same 10 cases.
The foreground run wrote `results-current.json` at `00:01:37 UTC`, overwriting the
scheduled run's JSON. The scheduled run's aggregate survives in D1 and
`.trial/matrix-pass2.log`; its individual suggestions were lost. The quality
assessment below uses the preserved foreground run only. Usage includes **both**
runs. This was an operational duplicate, not a provider retry; it is reported rather
than hidden.

| Item                    | Value                                                               |
| ----------------------- | ------------------------------------------------------------------- |
| Matrix start            | `2026-10-27T00:00:20Z` (foreground); `00:00:15Z` (scheduled)        |
| Endpoint                | `https://dotcomseekr-discovery-trial.mike-f16.workers.dev`          |
| Deployed source SHA     | `a38d7d50fb14483a0591bb0cb3542b00a3de7f17`                          |
| Deployment              | `trial-20261026T090120Z-a38d7d5`                                    |
| Model                   | `@cf/meta/llama-3.3-70b-instruct-fp8-fast`                          |
| Prompt / validator      | `2026-10-26.2` / `2026-10-26.3`                                     |
| Cases                   | `crane-machine` (word), `common-ground` (phrase)                   |
| Techniques              | synonyms, rhymes, affixes, possessives, hyphens                     |
| Requests per run        | 10 (one expected pre-provider refusal)                              |
| Provider attempts       | 9 per run; 18 in total across both runs                             |

### Per-case results (preserved foreground run)

“Useful” is the qualitative judgement in the assessment below, not schema validity. Latency
is wall time for the request; provider latency is reported in the aggregate.

| Case           | Technique   | HTTP | Provider calls | Accepted / rejected | Useful | Input | Output | Total | Neurons | Est. cost | Latency   |
| -------------- | ----------- | ---: | -------------: | ------------------: | -----: | ----: | -----: | ----: | ------: | --------: | --------: |
| crane-machine  | synonyms    |  200 |              1 |                5 / 0 |    5/5 |   464 |    174 |   638 | 48.0099 | $0.000528 | 15,153 ms |
| crane-machine  | rhymes      |  200 |              1 |                1 / 4 |    0/1 |   513 |    184 |   697 | 51.3647 | $0.000565 |  5,127 ms |
| crane-machine  | affixes     |  200 |              1 |                3 / 2 |    0/3 |   545 |    143 |   688 | 43.8210 | $0.000482 | 12,639 ms |
| crane-machine  | possessives |  200 |              1 |                4 / 0 |    2/4 |   476 |    137 |   613 | 40.7521 | $0.000448 |  7,158 ms |
| crane-machine  | hyphens     |  400 |              0 |                0 / 0 |    n/a |     0 |      0 |     0 |      0 |    $0.000 |     13 ms |
| common-ground  | synonyms    |  200 |              1 |                1 / 1 |    0/1 |   568 |     69 |   637 | 29.2788 | $0.000322 |  2,870 ms |
| common-ground  | rhymes      |  200 |              1 |                1 / 0 |    1/1 |   617 |     51 |   668 | 26.8990 | $0.000296 |  1,940 ms |
| common-ground  | affixes     |  200 |              1 |                3 / 0 |    0/3 |   677 |    107 |   784 | 39.9682 | $0.000439 |  6,145 ms |
| common-ground  | possessives |  200 |              1 |                4 / 0 |    3/4 |   568 |    149 |   717 | 45.6632 | $0.000502 |  7,275 ms |
| common-ground  | hyphens     |  200 |              1 |                1 / 0 |    1/1 |   552 |     48 |   600 | 24.5512 | $0.000270 |  2,454 ms |

Foreground totals: **9 provider attempts, 23 accepted suggestions, 7 rejected
candidates, 6,042 tokens (4,980 in / 1,062 out), 350.31 billed Neurons, $0.003852
estimated, 6,751 ms average provider latency.** The single-word hyphen refusal is an
expected API validation response, not a provider failure: HTTP 400
`technique_unavailable`, zero provider calls.

### Quality assessment

Each accepted suggestion was judged separately on the request's criteria:

1. valid recognised word or permitted construction;
2. correct technique;
3. relationship to the selected brand meaning and commentary;
4. readability as a domain label;
5. useful suggestion versus merely schema-valid.

An unusual combination was not rejected just for being unusual; it was judged in the
actual brand context (industrial crane rental, or neighbour mediation). A suggestion
counts as useful only if it could plausibly be proposed to a client.

| Case / technique          | Accepted | Useful | Assessment                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | -------: | -----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crane / synonyms          |        5 |      5 | `hoist`, `winch`, `derrick`, `gantry`, `lift` all keep the lifting-machine meaning and are readable. `lift` is the broadest, but still usable. This is the strongest round.                                                                                                                                                                                        |
| Crane / rhymes            |        1 |      0 | `plane` is a recognised rhyme, but the reason (“the flat area where the machine operates”) is a stretch; it does not reinforce crane rental. `drane`, `grane`, `trane` and `strane` were correctly rejected as non-words.                                                                                                                                    |
| Crane / affixes           |        3 |      0 | `craneness`, `craneify` and `recrane` use bound affixes, so they pass the boundary rule, but they are awkward as brands. `cranelike` was rejected even though `-like` is a productive suffix; that is a false negative, not a quality win. `cranability` was correctly rejected as malformed.                                                                     |
| Crane / possessives       |        4 |      2 | `ourcrane` and `yourcrane` are natural for an equipment-rental brand. `mycrane` and `theircrane` are grammatical but less convincing.                                                                                                                                                                                                                           |
| Crane / hyphens           |        0 |    n/a | Single-word hyphenation is unavailable by design (HTTP 400 before the provider). This is correct behaviour, not a failed round.                                                                                                                                                                                                                               |
| Common ground / synonyms  |        1 |      0 | `commonconsensus` keeps the agreement meaning but is redundant (“common” + “consensus”) and reads poorly. The model correctly avoided returning the working name itself.                                                                                                                                                                                         |
| Common ground / rhymes    |        1 |      1 | `commonround` is a recognised rhyme and “round” can mean a discussion or roundtable, which fits mediation. It is the best rhyme in this pass, though still marginal as a brand.                                                                                                                                                                                  |
| Common ground / affixes   |        3 |      0 | `commonnessground`, `recommonground` and `commonifyground` attach a bound affix to “common”, but the joined results are malformed or misleading (`recommonground` reads like “recommend ground”). This remains the weakest technique for phrases.                                                                                                                 |
| Common ground / possessives |      4 |      3 | `ourcommonground`, `yourcommonground` and `theircommonground` are grammatically natural expansions of “common ground” and fit a shared mediation space. `mycommonground` is more individual and weaker.                                                                                                                                                             |
| Common ground / hyphens   |        1 |      1 | `common-ground` is exactly the permitted transformation, readable, and keeps the brand meaning. A clean, if unambitious, result.                                                                                                                                                                                                                               |

**Foreground quality: 12 useful out of 23 accepted (52%).** Technical validity was
high, but nearly half of the accepted output was merely schema-valid. The useful
suggestions were concentrated in synonyms and possessives; affixes and rhymes
produced little that a client would choose. A cheap response that returns five weak
suggestions is therefore not counted as a success.

Rejected candidates: 7 in the foreground (4 non-word rhymes, 2 malformed affixes,
1 self-suggestion). Six were correctly rejected; `cranelike` is the one questionable
false negative because `-like` is a productive suffix. The validator's allowlist is
deliberately conservative, but this is a boundary worth revisiting before treating
affix rejection as a pure quality signal.

### Empty rounds and previous failures

- No empty round occurred in the preserved foreground run.
- The duplicate scheduled run had one empty round: `common-ground` / hyphens returned
  HTTP 200 with zero suggestions and `empty_model_response`. Its response body was
  overwritten, but D1 and the run log record the empty outcome. The UI's empty-state
  notice is covered by fixtures; the live empty state was not clicked through.
- No prior failed spelling (`drane`, `grane`, `krane`, `blueflorit`, `herswift`,
  `uncommonground`) appeared in any preserved accepted output. This is a containment
  check on these cases, not a re-test of those original inputs.

### Duplicate run aggregate (quality not assessable)

The scheduled run produced 20 accepted suggestions across 7 successful provider
turns, one 503 `lexical_unavailable` rhyme round, one empty hyphen round, and the
expected single-word hyphen 400. D1 records 9 candidate rejections (the runner's
console line undercounted five from the 503 round; D1 is authoritative). Its
individual suggestions were overwritten, so no quality verdict is claimed for it.
Its usage is included below.

## 5. Measured usage and remaining allowance

### This pass (both runs, actual D1 rows)

| Metric                          | Foreground | Scheduled duplicate |            Both runs |
| ------------------------------- | ---------: | ------------------: | -------------------: |
| Provider attempts               |          9 |                   9 |                   18 |
| Successful provider turns       |          9 |                   7 |                   16 |
| Validation-rejected turns       |          0 |                   2 |                    2 |
| Provider errors / retries       |      0 / 0 |               0 / 0 |                0 / 0 |
| Input tokens                    |      4,980 |               4,980 |                9,960 |
| Output tokens                   |      1,062 |               1,086 |                2,148 |
| Total tokens                    |      6,042 |               6,066 |               12,108 |
| Billed Neurons (`usage.neurons`) |    350.31 |              355.22 |               705.53 |
| Estimated cost                  |  $0.003852 |           $0.003906 |             $0.007758 |
| Average provider latency        |  6,751 ms |            6,584 ms |              6,668 ms |
| Accepted suggestions            |         23 |                  20 |                   43 |
| Candidates rejected             |          7 |                   9 |                   16 |
| Lexical calls / cache hits      |      7 / 17 |              16 / 10 |              23 / 27 |
| Lexical-service cost            |      $0.00 |               $0.00 |                $0.00 |

The scheduled run's “2 validation-rejected turns” are the 503 rhyme round and the
empty hyphen round; the 400 single-word hyphen request never reached the provider and
is not an attempt. There were no provider-level retries inside a turn.

### Per user turn

A user turn is one explicit request for a batch of naming suggestions. The
foreground run is 10 user turns, 9 of which reached the provider:

- **Tokens per user turn:** 604.2 (671.3 per provider attempt)
- **Billed Neurons per user turn:** 35.03 (38.92 per provider attempt)
- **Estimated cost per user turn:** **$0.000385** ($0.000428 per provider attempt)
- **Provider latency per provider attempt:** 6,751 ms; wall time per user turn: 6,723 ms
- **Useful suggestions per user turn:** 1.2 (12 useful / 10 requests); 1.33 per provider turn

The 100/1,000-turn projections below use the measured foreground cost per user turn.
They are arithmetic from 10 requests, not a demand forecast:

| Scale       | Estimated cost |
| ----------- | -------------: |
| 100 turns   |     **$0.0385** |
| 1,000 turns |      **$0.385** |

Using both runs' 20 user requests instead gives $0.000388 per user turn,
**$0.0388 / 100** and **$0.388 / 1,000**; the difference is negligible. No
Neuron-to-token conversion was invented: cost uses the provider's token prices, while
Neurons are the provider's actual billed units.

### Cumulative and remaining allowance

After both runs, D1 contains **98 provider attempts / 98 turns / 53,940 tokens /
3,549.21 billed Neurons / $0.039028 estimated** across the whole trial.

| Limit                     |            Used | Remaining        |
| ------------------------- | --------------: | ---------------: |
| Shared daily naming turns |         18 / 80 | **62 today**     |
| Shared daily provider calls |        18 / 100 | 82 today        |
| Overall naming turns      |         98 / 150 | **52**          |
| Overall provider calls    |         98 / 250 | 152             |
| Overall tokens            | 53,940 / 400,000 | 346,060         |
| Daily free Neurons (account allocation) | 705.53 / 10,000 | 9,294.47 (trial-attributed only) |

The binding limit for Mike is **52 overall naming turns**, not the daily or Neuron
allowance. That is comfortably above the requested 20-turn reserve. At the measured
35.03 Neurons per user turn, 52 turns would use about 1,822 Neurons, well inside the
trial-attributed daily free allocation; the 150-turn cap arrives first. These are
small-sample estimates.

### Uncertainty

- The 10,000-Neuron daily allocation is shared across the Cloudflare account.
  Account-wide consumption is not exposed by the tooling used; only the trial's
  per-request billed Neurons are actual. “9,294.47 left” is trial-attributed, not a
  statement about the whole account.
- Billing alerts are notifications, not hard spending caps. None were relied on. No
  paid overage was enabled and no plan change was made.
- The matrix used two cases and 18 provider attempts; per-turn averages are indicative,
  not a stable forecast. The duplicate run is included in spend but not in the
  quality score.
- The trial's limit checks are check-then-insert and can overshoot slightly under
  concurrent requests. This is a bounded trial, not billing-grade quota enforcement.
- No OpenAI fallback, login, billing or BYOK work was added.

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
fixtures. The live checks in sections 3 and 4 are the live evidence for this pass.

PR checks: GitGuardian passed and the Cloudflare Workers Builds branch **preview**
passed. `wrangler deployments list --name dotcomseekr2` still shows the latest
production deployment on 2026-10-24, before this branch was pushed; the push did not
release production.

Not run or not verified:

- A live click-through of the empty-round UI state. The duplicate run produced one
  empty API round, but its response body was overwritten before the UI check.
- Deno typecheck or deployment of the Supabase function. Deno is not installed; the
  production function was not deployed.
- Any production deployment, merge, OpenAI comparison, login, billing or BYOK.
- A fresh comparison against the existing OpenAI integration. Provider comparisons
  are stopped for this task.

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
