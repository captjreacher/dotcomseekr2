#!/usr/bin/env node
// Exercise every guided-discovery technique against the isolated trial.
//
// The tester code is read from a local, gitignored file (or TRIAL_KEY). Results
// are written to docs/workers-ai-trial/results.json so the report can quote
// measured responses. Hyphens on a single word are expected to be refused before
// any provider call: a single word has no word boundary to hyphenate.
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const endpoint =
  process.env.TRIAL_URL || 'https://dotcomseekr-discovery-trial.mike-f16.workers.dev';

function readKey() {
  if (process.env.TRIAL_KEY?.trim()) return process.env.TRIAL_KEY.trim();

  const keyFile = process.env.TRIAL_KEY_FILE || resolve(repoRoot, '.trial/access-keys.local.txt');
  const line = readFileSync(keyFile, 'utf8')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value && value.includes('='));

  if (!line) throw new Error(`No tester key found in ${keyFile}`);
  return line.slice(line.indexOf('=') + 1).trim();
}

const cases = [
  {
    id: 'swift-fast',
    mode: 'word',
    original: 'swift',
    meaning: 'moving or happening quickly',
    commentary: 'A same-day logistics service for small shops. The meaning is speed, not the bird.',
    ambiguity: 'swift can mean a bird, a current, or fast movement; speed is chosen.',
  },
  {
    id: 'crane-machine',
    mode: 'word',
    original: 'crane',
    meaning: 'a tall machine that lifts and moves heavy loads',
    commentary: 'Industrial equipment rental for construction teams. The meaning is the machine.',
    ambiguity: 'crane can mean a bird, to stretch the neck, or lifting machinery.',
  },
  {
    id: 'blue-orbit',
    mode: 'phrase',
    original: 'blue orbit',
    meaning: 'a calm, repeating path around a shared goal',
    commentary: 'A planning tool for teams that want steady progress without frantic urgency.',
    ambiguity: 'blue can be a colour or sadness; orbit can be literal or a working rhythm.',
  },
  {
    id: 'common-ground',
    mode: 'phrase',
    original: 'common ground',
    meaning: 'shared agreement between people who disagree',
    commentary:
      'A mediation service for neighbours in disputes. Ground is figurative agreement, not soil.',
    ambiguity: 'ground can be soil, a reason, or an area of agreement.',
  },
];

const techniques = ['synonyms', 'rhymes', 'affixes', 'possessives', 'hyphens'];
const previousFailures = ['drane', 'grane', 'krane', 'blueflorit', 'herswift', 'uncommonground'];
const key = readKey();
const results = [];

for (const item of cases) {
  const session = randomUUID();

  for (const technique of techniques) {
    const turnId = randomUUID();
    const payload = {
      action: 'variations',
      technique,
      mode: item.mode,
      original: item.original,
      workingName: item.original,
      meaning: item.meaning,
      meaningSource: null,
      commentary: item.commentary,
      previous: [],
      turnId,
    };

    const started = Date.now();
    const response = await fetch(`${endpoint}/v1/variations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-trial-key': key,
        'x-trial-session': session,
      },
      body: JSON.stringify(payload),
    });
    const elapsedMs = Date.now() - started;

    let body;
    try {
      body = await response.json();
    } catch {
      body = { error: 'Response was not JSON.' };
    }

    results.push({
      id: item.id,
      mode: item.mode,
      technique,
      ambiguity: item.ambiguity,
      input: {
        original: item.original,
        meaning: item.meaning,
        commentary: item.commentary,
      },
      turnId,
      httpStatus: response.status,
      elapsedMs,
      providerCalls: body.trial?.providerCalls ?? 0,
      acceptedCount: body.trial?.acceptedCount ?? 0,
      rejectedCount: body.trial?.rejectedCount ?? 0,
      error: body.error ?? null,
      code: body.code ?? null,
      noResults: body.noResults ?? null,
      lexical: body.lexical ?? null,
      model: body.model ?? null,
      variations: body.variations ?? [],
      rejected: body.rejected ?? [],
    });

    const status = response.status === 200 ? 'ok' : `${response.status} ${body.code ?? ''}`;
    const empty = body.noResults ? ` [${body.noResults.reason}]` : '';
    console.log(
      `${item.id.padEnd(14)} ${technique.padEnd(11)} ${status} ${body.variations?.length ?? 0} accepted, ${body.rejected?.length ?? 0} rejected, ${body.lexical?.calls ?? 0} lexical calls, ${elapsedMs}ms${empty}`
    );

    await new Promise((done) => setTimeout(done, 900));
  }
}

const acceptedSpellings = results.flatMap((result) =>
  result.variations.map((variation) => String(variation.spelling).toLowerCase())
);
const forbiddenHits = previousFailures.filter((word) => acceptedSpellings.includes(word));
const summary = {
  requests: results.length,
  providerTurns: results.filter((result) => result.providerCalls > 0).length,
  successfulTurns: results.filter(
    (result) => result.httpStatus === 200 && result.variations.length > 0
  ).length,
  emptyRounds: results.filter((result) => result.noResults).length,
  failedTurns: results.filter((result) => result.httpStatus !== 200).length,
  acceptedSuggestions: acceptedSpellings.length,
  rejectedCandidates: results.reduce((total, result) => total + result.rejected.length, 0),
  lexicalCalls: results.reduce((total, result) => total + (result.lexical?.calls ?? 0), 0),
  lexicalCacheHits: results.reduce((total, result) => total + (result.lexical?.cacheHits ?? 0), 0),
  previousFailures,
  forbiddenHits,
};

const output = {
  generatedAt: new Date().toISOString(),
  endpoint,
  model: results.find((result) => result.model)?.model ?? null,
  summary,
  cases: results,
};

mkdirSync(resolve(repoRoot, 'docs/workers-ai-trial'), { recursive: true });
const outputPath = resolve(repoRoot, 'docs/workers-ai-trial/results.json');
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`\nWrote ${outputPath}`);
console.log(JSON.stringify(summary, null, 2));

if (forbiddenHits.length > 0) {
  console.error(`Previous failures leaked into accepted suggestions: ${forbiddenHits.join(', ')}`);
  process.exitCode = 1;
}
