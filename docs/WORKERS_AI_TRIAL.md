# Cloudflare Workers AI trial — guided discovery quality pass

Status: **pass 1 archived; branch unmerged; production unchanged.**

> Pass 2 supersedes the affix and rhyme boundaries described here and adds the
> hosted tester frontend. See
> [`workers-ai-trial/QUALITY_PASS_2.md`](workers-ai-trial/QUALITY_PASS_2.md). The
> measurements below are pass-1 history and are not pass-2 results.

- Branch: `trial/workers-ai-guided-discovery`, based directly on `feat/guided-discovery` (PR #6, still open).
- Isolated deployment: `https://dotcomseekr-discovery-trial.mike-f16.workers.dev`
- Worker: `dotcomseekr-discovery-trial` (Workers AI + D1), separate from the existing `dotcomseekr2` Worker.
- Database: D1 `dotcomseekr-discovery-trial` (`f80f2cae-70b0-47e7-81e2-b507732088d9`, region OC).
- Existing Supabase `dotcomseekr-discovery` + `OPENAI_API_KEY` integration is untouched and remains the default when `VITE_DISCOVERY_TRIAL_URL` is not configured.
- No merge, no production web deployment, no Supabase function deployment, no custom domain.
- The trial's shared daily allowance is now exhausted at **80/80 provider calls**; no cap was raised.

## 1. What changed in this pass

### Real-word verification for rhymes and affixes

`apps/web/src/lib/discovery/lexical.ts` is an independent lexical check built on
**Wiktionary** (Wikimedia Foundation, CC BY-SA 4.0). It reads the public
page-definition API and keeps only current English lexical senses: nouns, verbs,
adjectives, adverbs, pronouns, prepositions, conjunctions, determiners,
interjections, numerals, particles and articles. Symbols, abbreviations, initialisms,
Roman numerals, ISO language codes, misspellings, slang-only and obsolete-only
forms are not accepted as words.

The Worker's `src/lexical.ts` makes the lookup, caches the result in D1 for 30
days, and reports the source and licence with every checked round. Cache rows are
keyed by `SHA-256(term)`, so usage data does not accumulate a plaintext list of
brand words. The model is never asked to vouch for its own invention.

Validation uses the independent answer:

- Rhymes: the **replaced word** must be a recognised word. For a phrase, the
  joined domain phrase is never sent to the dictionary; only the slot that
  replaces or modifies the word is checked. Phonetic rhyme validation remains.
- Affixes: the result must be a real whole word, a recognised word/familiar
  brand affix attached to the anchor, or a short productive brand affix. Grammatical
  endings (`-ly`, `-ier`, `-ing`, etc.) are only allowed when they form a real whole
  word. Negating additions (`un-`, `non-`, `anti-`, `dis-`, `-less`) are rejected
  unless the whole result is itself a recognised word.
- If the lexical service is unavailable, the Worker returns HTTP 503
  `lexical_unavailable` and no suggestions. It does not silently fall back to
  "assume it is a word", and it does not call another provider.

### Affixes, possessives and empty rounds

- Possessives are limited to **my / your / our / their**. `his`, `her` and `its`
  are rejected with an explicit awkwardness reason; `herswift` no longer survives.
- A proposal whose own reason admits a poor fit ("does not fit", "negative
  connotation", "unrelated", "different sense") is rejected. This is a
  self-contradiction guard, not a large word blacklist.
- Empty rounds are a normal, explained outcome. The Worker returns HTTP 200 with
  `variations: []`, the rejected candidates, and `noResults: { reason, message }`.
  The browser shows that message instead of an error or filler. An empty model
  answer is distinguished from a quality rejection.
- The prompt now states that the selected meaning and commentary are binding,
  that invented or obsolete rhymes are forbidden, that affixes must use a real
  word or familiar brand affix, and that fewer or no suggestions are preferred to
  filler.

No invented-spelling mode was added. The existing OpenAI path and wizard were not
rewritten; the trial remains a provider adapter behind the same request/response
shape.

## 2. Model, pricing and access

Selected model: **`@cf/meta/llama-3.3-70b-instruct-fp8-fast`**.

Official figures, retrieved **2026-10-26**:

| Item            | Value                                                       |
| --------------- | ----------------------------------------------------------- |
| Input price     | $0.293 per 1M tokens · 26,668 Neurons per 1M input tokens   |
| Output price    | $2.253 per 1M tokens · 204,805 Neurons per 1M output tokens |
| Workers AI rate | $0.011 per 1,000 Neurons                                    |
| Free allocation | 10,000 Neurons per day, resets 00:00 UTC                    |
| Rate limit      | 300 text-generation requests/minute (account default)       |

Sources:

- Pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- JSON Mode and supported models: https://developers.cloudflare.com/workers-ai/features/json-mode/
- Model page: https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/
- Limits and error codes: https://developers.cloudflare.com/workers-ai/platform/limits/ and https://developers.cloudflare.com/workers-ai/platform/errors/
- Wiktionary licence: https://en.wiktionary.org/wiki/Wiktionary:Copyrights

Access verification for this account:

- `wrangler ai models` (live account catalog) lists the model.
- Real calls returned suggestions and `usage` with `prompt_tokens`,
  `completion_tokens`, `total_tokens` **and `neurons`**.
- No 3036 (daily free allocation exhausted), 5007 (no such model) or plan/permission
  error occurred.
- Account-wide Neuron consumption and the plan's remaining balance are not exposed
  by the tooling used. Per-request billed Neurons are actual; account-wide headroom
  is unknown.

## 3. Measured quality pass

### Bound and method

The matrix is 4 synthetic brand cases (2 words, 2 phrases) × 5 techniques:

- `swift` → “moving or happening quickly” (bird / current / speed)
- `crane` → “a tall machine that lifts and moves heavy loads” (bird / stretch / machine)
- `blue orbit` → “a calm, repeating path around a shared goal” (colour / sadness; literal / figurative orbit)
- `common ground` → “shared agreement between people who disagree” (soil / reason / agreement)

That is 20 requests, 18 provider-backed turns and 2 expected single-word hyphen
refusals. Two targeted `common ground` rhyme calls checked the final self-admission
guard, and one localhost UI round rendered a real Swift rhyme response. All three
are included in the usage totals below.

### Result summary

| Metric                                   | Quality pass (matrix + targeted + UI) |
| ---------------------------------------- | ------------------------------------: |
| Provider attempts                        |                                    21 |
| Successful provider turns                |                                    20 |
| Empty model response                     |                                     1 |
| Provider errors                          |                                     0 |
| Retries                                  |                                     0 |
| Validation rejections (provider-backed)  |                                     1 |
| Individual candidates rejected by rules  |                                    11 |
| Accepted suggestions                     |                                    78 |
| Judged useful in context (my assessment) |                              ~50 / 78 |
| Input tokens                             |                                10,606 |
| Output tokens                            |                                 3,219 |
| Total tokens                             |                                13,825 |
| Billed usage (actual `usage.neurons`)    |                        942.11 Neurons |
| Estimated cost                           |                             $0.010360 |
| Average provider latency                 |                              4,619 ms |
| Average lexical latency (lexical rounds) |                              2,017 ms |
| Lexical-service calls                    |                                    60 |
| Lexical cache hits                       |                                    14 |
| Lexical-service cost                     |                 $0.00 (Wikimedia API) |

Per provider turn: **658 tokens · 44.86 Neurons · $0.000493 · 4.62 s**.
Useful suggestions per turn: about **2.4** under my judgment; accepted suggestions
per turn: **3.7**.

Projected cost at the quality-pass average:

| Scale       | Estimated cost |
| ----------- | -------------: |
| 100 turns   |    **$0.0493** |
| 1,000 turns |     **$0.493** |

### By technique and mode

| Technique   | Mode   | Attempts | Tokens | Neurons |      Cost | Accepted | Lexical calls / hits | Avg provider latency |
| ----------- | ------ | -------: | -----: | ------: | --------: | -------: | -------------------: | -------------------: |
| Synonyms    | word   |        2 |  1,171 |   90.19 | $0.000992 |       10 |                0 / 0 |             5,260 ms |
| Synonyms    | phrase |        2 |  1,528 |  126.43 | $0.001391 |        9 |                0 / 0 |             7,095 ms |
| Rhymes      | word   |        3 |  1,867 |  131.73 | $0.001449 |       15 |               10 / 5 |             4,962 ms |
| Rhymes      | phrase |        4 |  2,942 |  194.42 | $0.002138 |       13 |               11 / 7 |             4,797 ms |
| Affixes     | word   |        2 |  1,228 |   88.33 | $0.000971 |        8 |               19 / 1 |             4,489 ms |
| Affixes     | phrase |        2 |  1,509 |   99.03 | $0.001089 |        7 |               20 / 1 |             5,073 ms |
| Possessives | word   |        2 |  1,156 |   82.84 | $0.000911 |        7 |                0 / 0 |             4,305 ms |
| Possessives | phrase |        2 |  1,366 |   93.25 | $0.001026 |        8 |                0 / 0 |             4,337 ms |
| Hyphens     | phrase |        2 |  1,058 |   35.87 | $0.000394 |        1 |                0 / 0 |               905 ms |

The hyphen row includes one empty model response; the other hyphen response
produced `blue-orbit`. Single-word hyphens never reach the provider.

### Whole trial to date

| Metric                      |               Value |
| --------------------------- | ------------------: |
| Provider attempts           |                  80 |
| Successful attempts         |                  67 |
| Validation rejections       |                  13 |
| Provider errors             |                   0 |
| Total tokens                |              41,832 |
| Billed Neurons (actual)     |            2,843.68 |
| Estimated cost              |           $0.031271 |
| Average provider latency    |            3,910 ms |
| Overall trial turns used    |            80 / 150 |
| Overall provider calls used |            80 / 250 |
| Overall tokens used         |    41,832 / 400,000 |
| Shared daily calls used     | 80 / 80 (exhausted) |

### Remaining allowance and uncertainty

- By the trial's own actual billed usage, today used **2,843.68 of 10,000
  Neurons**, leaving **7,156.32 Neurons**. At 44.86 Neurons/turn that is about
  **159 further turns**.
- That is not available today: the trial's shared daily cap is **80/80 provider
  calls**. The overall cap leaves 70 turns after the daily reset.
- The free allocation is shared across the Cloudflare account, and account-wide
  consumption is unknown. Billing alerts are notifications, not hard caps; none
  were relied on. No paid overage was enabled and no plan change was made.
- The daily cap is the binding limit for this trial, not the Neuron balance.

## 4. Quality findings

### Previous failures

`drane`, `grane`, `krane`, `blueflorit`, `herswift` and `uncommonground` were the
specific failures from the first pass.

- **`blueflorit`** was returned in the live matrix and rejected live:
  `“florit” is not a recognised English word.`
- **`herswift`** was rejected live by the possessive rule:
  “Third-person possessives read awkwardly for a brand; use my, your, our or their.”
- **`uncommonground`** was rejected live by the affix rule:
  “That prefix or suffix negates the working name instead of extending it.”
- **`grane`** is obsolete-only in Wiktionary and is rejected by the shared validator
  and its fixture test. **`drane`** and **`krane`** have no English entry in
  Wiktionary. The final live matrix did not return any of the three, so the evidence
  for those exact spellings is lexical lookup plus regression fixtures, not a live
  model response.
- No previous-failure spelling appears in the accepted suggestions of the final
  matrix.

### What the live suggestions looked like

| Case / technique            | Accepted                                                             | Assessment                                                                                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Swift / synonyms            | fast, rapid, quick, speedy, brisk                                    | **5/5 useful.** Directly on the speed meaning.                                                                                                                                                                            |
| Swift / rhymes              | lift, shift, drift, gift, thrift                                     | **3/5 useful.** All real words and genuine rhymes; `shift`, `gift`, `thrift` fit the logistics commentary; `lift` and `drift` are weaker.                                                                                 |
| Swift / affixes             | speedswift, swiftly, ultraswift                                      | **2/3 useful.** `swiftly` and `ultraswift` read well; `speedswift` is a readable but clumsy compound. `swiftier` was rejected as a non-word grammatical ending.                                                           |
| Swift / possessives         | ourswift, myswift, theirswift                                        | **1/3 useful.** All are permitted forms, but possessive branding is inherently thin.                                                                                                                                      |
| Crane / synonyms            | hoist, gantry, winch, derrick, lift                                  | **5/5 useful.** Strong fit with the lifting-machine sense.                                                                                                                                                                |
| Crane / rhymes              | train, drain, strain, gain, chain                                    | **4/5 useful.** All real rhymes; `train`, `drain`, `strain` and `chain` fit industrial use; `gain` is generic.                                                                                                            |
| Crane / affixes             | cranelift, craneplus, cranepro, industrialscrane, cranemax           | **4/5 useful.** `cranelift`, `craneplus` and `cranemax` read as brand names; `industrialscrane` is awkward.                                                                                                               |
| Crane / possessives         | ourcrane, yourcrane, mycrane, theircrane                             | **2/4 useful.** Valid but undifferentiated.                                                                                                                                                                               |
| Blue orbit / synonyms       | bluecircle, blueroute, bluepath, bluetrack, bluecycle                | **5/5 useful.** All preserve the calm-path idea.                                                                                                                                                                          |
| Blue orbit / rhymes         | bluemerit, bluespirit                                                | **1/2 useful.** Both are real rhymes; `bluespirit` fits the tone better than `bluemerit`. `blueflorit`, `blueparit` and `bluenorit` were rejected.                                                                        |
| Blue orbit / affixes        | blueproorbit, blueorbitpro, coreblueorbit, blueorbitcore             | **2/4 useful.** The `-pro` and `-core` forms are readable; stacking `pro` before `orbit` is clumsy.                                                                                                                       |
| Blue orbit / possessives    | ourblueorbit, myblueorbit, yourblueorbit, theirblueorbit             | **2/4 useful.** Correct forms; long and low-differentiation.                                                                                                                                                              |
| Blue orbit / hyphens        | blue-orbit                                                           | **1/1 useful.** Correct boundary.                                                                                                                                                                                         |
| Common ground / synonyms    | commonaccord, mutualground, commonconsensus, jointground             | **3/4 useful.** `commonaccord` and `commonconsensus` are strong; `mutualground` works; `jointground` is less natural.                                                                                                     |
| Common ground / rhymes      | commonround, commonmound, commonfound, commonwound                   | **1/4 useful.** All are real rhymes, but the semantic fit is weak: `mound` pulls toward soil, `wound` toward injury, and `found` reads grammatically oddly. `commonround` is the only one that can mean a round of talks. |
| Common ground / affixes     | commonfairground, publiccommonground, commonmiddleground             | **1/3 useful.** Long and awkward; `commonmiddleground` is the clearest.                                                                                                                                                   |
| Common ground / possessives | ourcommonground, yourcommonground, mycommonground, theircommonground | **2/4 useful.** Correct but long.                                                                                                                                                                                         |
| Common ground / hyphens     | —                                                                    | **Empty model response.** The server returned `empty_model_response` with a clear message; no filler was invented.                                                                                                        |

The overall pattern is **technical compliance is now strong; semantic judgment is
still the limiting factor**. The lexical filter fixed the invented-rhyme problem.
The remaining weak suggestions are real words with a weak or misleading fit, not
schema violations. This is why the report separates “schema-valid” from “useful”.

### Targeted guard checks

After the matrix showed `commonwound` accepted with a reason that said it had a
“negative connotation”, a self-admission guard was added. Two live
`common ground` rhyme calls on the final Worker returned:

- Run 1: `commonround`, `commonhound`; `commonmound` rejected for an over-long reason.
- Run 2: `commonround`, `commonmound`, `commonhound`, `commonfound`, `commonwound`.
  This time the model's `commonwound` reason was positive (“healing of disputes”),
  so the self-admission guard correctly did not fire. The earlier negative-reason
  case is covered by a unit test with the exact live response.

That is an honest limitation: the guard rejects a model that admits a poor fit;
it cannot prove that a confident metaphor is useful. The quality assessment above
marks those suggestions weak rather than claiming they are validated.

## 5. Caching, privacy and failure behaviour

- Wiktionary lookups are cached for 30 days in D1 as
  `SHA-256(term)`; no plaintext term is stored. Cache rows keep `recognized`,
  source, licence, HTTP status and timestamp.
- `lexical_cache` writes are best-effort; the correctness decision comes from the
  live/cached answer. A cache read or write failure does not turn an unknown word
  into a recognised one.
- If one lookup in a round fails, the whole round fails with
  `lexical_unavailable`; no partially verified list is shown.
- The provider adapter still has no fallback to OpenAI or any other paid provider.
- Usage rows contain pseudonymous `session_ref`, technique, mode, provider, exact
  model, tokens, actual `usage.neurons`, estimated cost with pricing source/date,
  latency, outcome, rejected and accepted counts, and lexical call/cache/latency
  fields. Brand commentary, brand input, tester codes and credentials are not
  written to D1.
- If usage recording fails, suggestions are withheld (HTTP 503
  `trial_accounting_failed`).

## 6. Verification performed

Automated:

- `node --test "workers/discovery-trial/test/**/*.test.ts"` — **22/22 pass**,
  including hashed cache reuse, obsolete-word rejection, dictionary outage,
  rhyme real-word rejection, phrase-slot lookup, affix quality, negation,
  possessives, empty rounds and lexical-unavailable accounting.
- `npm run test -w @dotcomseekr/web` — **130/130 pass**, including new lexical
  parser fixtures, previous-failure regressions and the self-admission guard.
- `node node_modules/typescript/bin/tsc -p workers/discovery-trial/tsconfig.json`
  — clean.
- `npm run build -w @dotcomseekr/web` — clean (`tsc` + Vite).

Live:

- Deployed isolated Worker versions `3bf7bdf2-84b4-40e6-b77d-070ad9d4789b`
  (quality pass) and `4b358345-b206-4c16-8ad4-f77b707c4e6e` (self-admission guard).
- Applied D1 migration `0002_quality.sql` (new accounting columns + hashed
  `lexical_cache`).
- 20-request matrix: 18 provider-backed turns, 17 successful generations, 1 empty
  model response, 2 expected single-word hyphen refusals. `forbiddenHits: []`.
- Two targeted `common ground` rhyme calls on the final Worker.
- D1 row inspection confirmed exact model, tokens, actual Neurons, cost, latency,
  accepted/rejected counts, lexical calls/hits and hashed session references.
- Local Vite UI against the deployed Worker: entered a tester code, selected Rhymes
  for `swift`, generated a real round (`lift`, `shift`, `drift`, `gift`, `thrift`),
  and saw the “Rhymes and affixes are checked against Wiktionary (CC BY-SA 4.0)”
  copy. Network log: preflight 204 and POST 200 from
  `http://localhost:5173`; the unlisted `http://127.0.0.1:5173` origin was correctly
  refused. No console errors after the allowed-origin run.
- The empty-round server response is live. The corresponding browser notice was not
  separately driven after the daily cap was exhausted; it is covered by the
  response contract and unit tests, not by a final UI click.

Not verified:

- The Supabase edge function was not Deno-typechecked or redeployed (Deno is not
  installed here). Its shared prompt export was exercised through Node.
- A blind side-by-side quality comparison with `gpt-4o-mini` was not run; the
  existing integration was left untouched.
- Account-wide Workers AI consumption and the plan's remaining balance are unknown.
- `commonmound`, `commonhound` and similar real-word metaphors remain a quality
  risk. They are flagged in the assessment rather than hidden.
- The trial's daily cap is exhausted, so no further provider-backed quality run is
  possible today without changing limits.

## 7. Deployment and teardown

Deployment artifacts:

- Worker: `workers/discovery-trial/`
- Migrations: `0001_usage.sql`, `0002_quality.sql`
- Secret: `TRIAL_KEY_HASHES` (tester code hashes only; codes are gitignored)
- Local tester codes: `.trial/access-keys.local.txt` (not in this branch)

Commands used:

```bash
npx wrangler d1 execute dotcomseekr-discovery-trial --remote \
  --file=workers/discovery-trial/migrations/0001_usage.sql \
  --config workers/discovery-trial/wrangler.jsonc
npx wrangler d1 execute dotcomseekr-discovery-trial --remote \
  --file=workers/discovery-trial/migrations/0002_quality.sql \
  --config workers/discovery-trial/wrangler.jsonc
npx wrangler deploy --config workers/discovery-trial/wrangler.jsonc
```

Teardown, if the trial is not continued:

```bash
npx wrangler delete --config workers/discovery-trial/wrangler.jsonc
npx wrangler d1 delete dotcomseekr-discovery-trial --config workers/discovery-trial/wrangler.jsonc
```

Deleting is not required to stop tester access: remove or rotate
`TRIAL_KEY_HASHES` (or undeploy the Worker).

## 8. Merge order and dependency

This branch is based directly on `feat/guided-discovery` (PR #6), which is still
open. Its diff against that branch contains only the trial adapter, quality
validation, tests, docs and isolated Worker configuration. It must not be merged
before PR #6.

1. Review and merge PR #6 (`feat/guided-discovery`) first.
2. Rebase this draft PR on the merged guided-discovery commit if #6 changes.
3. Merge this trial PR after #6; it must not be merged into `main` ahead of #6.
4. Production remains unchanged until the trial is deliberately promoted; this
   PR does not deploy the web app or the Supabase function.

## 9. Trial limits

Unchanged:

- Session: 10 turns and 18 provider calls per UTC day.
- Shared trial: 80 turns and 100 provider calls per UTC day.
- Overall: 150 turns, 250 provider calls and 400,000 tokens.
- Limit checks are check-then-insert and can overshoot slightly under concurrent
  requests. This is a bounded trial, not billing-grade quota enforcement.
- Exhausted limits return HTTP 429 with the specific limit name. They never enable
  overage or fall back to another provider.
- The trial has now used its shared 80-call daily allowance, so the next step must
  wait for the UTC reset or be a deliberate, reviewed limit change.
