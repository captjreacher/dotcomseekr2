import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { generateDomainCandidates } from '../generation/generate';
import { DomainScorer } from '../scorer/DomainScorer';
import {
  CREATIVE_KINDS,
  CreativeEnricher,
  CreativeKind,
  ExplorationMode,
  FakeCreativeModel,
  MAX_CONFIDENCE_POINTS,
  abortableNeverResponder,
  enrichSearchCandidates,
  mergeCandidates,
  parseCreativeResponse,
  type CreativeCandidate,
  type CreativeResponse,
  type EnrichedCandidate,
  type EnrichedCreativeCandidate,
} from '../creative/index';

const CREATIVE_DIR = fileURLToPath(new URL('../creative', import.meta.url));

function response(
  candidates: Array<Partial<CreativeCandidate>>
): CreativeResponse {
  return {
    candidates: candidates.map((candidate) => ({
      value: 'placeholder',
      kind: CreativeKind.SEMANTIC,
      confidence: 0.7,
      rationale: 'test candidate',
      ...candidate,
    })) as CreativeCandidate[],
  };
}

function creativeOnly(candidates: EnrichedCandidate[]): EnrichedCreativeCandidate[] {
  return candidates.filter(
    (candidate): candidate is EnrichedCreativeCandidate => candidate.origin === 'creative'
  );
}

describe('CreativeEnricher', () => {
  it('makes exactly one creative model call per enrichment', async () => {
    const model = new FakeCreativeModel(() => response([{ value: 'cloudlet' }]));
    const enricher = new CreativeEnricher(model);

    const first = await enricher.enrich({
      seed: 'cloud sync',
      explorationMode: ExplorationMode.EXPLORATORY,
    });

    expect(model.calls).toBe(1);
    expect(first.modelCalls).toBe(1);
    expect(first.candidates.length).toBeGreaterThan(0);
  });

  it('serves repeat searches from the bounded cache without another call', async () => {
    const model = new FakeCreativeModel(() => response([{ value: 'cloudlet' }]));
    const enricher = new CreativeEnricher(model);

    const request = { seed: 'cloud sync', tone: 'BRANDABLE' };
    await enricher.enrich(request);
    const second = await enricher.enrich(request);

    expect(model.calls).toBe(1);
    expect(second.fromCache).toBe(true);
    expect(second.modelCalls).toBe(0);
    expect(enricher.getCacheSize()).toBe(1);
  });

  it('does not cache degraded results', async () => {
    const model = new FakeCreativeModel(() => {
      throw new Error('boom');
    });
    const enricher = new CreativeEnricher(model);

    await enricher.enrich({ seed: 'cloud' });
    await enricher.enrich({ seed: 'cloud' });

    expect(model.calls).toBe(2);
    expect(enricher.getCacheSize()).toBe(0);
  });

  it('fails safe on malformed model output', async () => {
    const model = new FakeCreativeModel(
      () => ({ candidates: 'not-an-array' }) as unknown as CreativeResponse
    );
    const enricher = new CreativeEnricher(model);

    const result = await enricher.enrich({ seed: 'cloud' });

    expect(result.candidates).toEqual([]);
    expect(result.degraded).toBe(true);
    expect(result.timedOut).toBe(false);
  });

  it('drops only the malformed entries of a partially valid response', async () => {
    const model = new FakeCreativeModel(
      () =>
        ({
          candidates: [
            { value: 'keeper', kind: 'semantic', confidence: 0.8, rationale: 'ok' },
            { value: 42, kind: 'bogus', confidence: 'nope' },
            { value: '', kind: 'semantic', confidence: 0.5, rationale: '' },
          ],
        }) as unknown as CreativeResponse
    );
    const enricher = new CreativeEnricher(model);

    const result = await enricher.enrich({ seed: 'cloud' });

    expect(result.candidates.map((candidate) => candidate.value)).toEqual(['keeper']);
    expect(result.degraded).toBe(false);
  });

  it('aborts the real request and fails safe on timeout', async () => {
    const model = new FakeCreativeModel(abortableNeverResponder);
    const enricher = new CreativeEnricher(model, { timeoutMs: 25 });

    const result = await enricher.enrich({ seed: 'timeout-seed' });

    expect(result.degraded).toBe(true);
    expect(result.timedOut).toBe(true);
    expect(result.candidates).toEqual([]);
    expect(model.calls).toBe(1);
  });

  it('keeps the cache bounded', async () => {
    const model = new FakeCreativeModel(() => response([{ value: 'cloudlet' }]));
    const enricher = new CreativeEnricher(model, { maxCacheEntries: 2 });

    await enricher.enrich({ seed: 'one' });
    await enricher.enrich({ seed: 'two' });
    await enricher.enrich({ seed: 'three' });

    expect(enricher.getCacheSize()).toBe(2);
  });
});

describe('parseCreativeResponse', () => {
  it('validates every supported creative kind', () => {
    const raw = {
      candidates: CREATIVE_KINDS.map((kind, index) => ({
        value: `value${index}`,
        kind,
        confidence: 0.5,
        rationale: `${kind} idea`,
      })),
    };

    const parsed = parseCreativeResponse(raw, 50);

    expect(parsed).toHaveLength(CREATIVE_KINDS.length);
    expect(parsed.map((candidate) => candidate.kind)).toEqual([...CREATIVE_KINDS]);
  });

  it('rejects unknown kinds and caps the candidate count', () => {
    const raw = {
      candidates: [
        { value: 'good', kind: 'semantic', confidence: 0.5, rationale: 'ok' },
        { value: 'bad', kind: 'trademark', confidence: 0.5, rationale: 'no' },
        { value: 'also-good', kind: 'invented', confidence: 0.5, rationale: 'ok' },
      ],
    };

    const parsed = parseCreativeResponse(raw, 1);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].value).toBe('good');
  });

  it('fails safe on null / non-object payloads', () => {
    expect(parseCreativeResponse(null, 10)).toEqual([]);
    expect(parseCreativeResponse('nope', 10)).toEqual([]);
    expect(parseCreativeResponse({}, 10)).toEqual([]);
  });
});

describe('mergeCandidates', () => {
  it('removes creative duplicates of deterministic labels (normalized equivalents)', () => {
    const deterministic = generateDomainCandidates({ seed: 'cloud sync', maxCandidates: 500 });
    expect(deterministic.length).toBeGreaterThan(0);

    // Use a real deterministic label so the test never depends on a specific
    // lexicon entry. Its hyphenated and upper-cased forms normalize back to it.
    const target = deterministic[0].label;
    const hyphenated = `${target.slice(0, 3)}-${target.slice(3)}`;

    const merged = mergeCandidates(
      deterministic,
      [
        { value: target, kind: CreativeKind.COMPRESSED, confidence: 0.9, rationale: 'dup' },
        { value: target.toUpperCase(), kind: CreativeKind.SEMANTIC, confidence: 0.9, rationale: 'dup' },
        { value: hyphenated, kind: CreativeKind.PORTMANTEAU, confidence: 0.9, rationale: 'dup' },
      ],
      { seed: 'cloud sync' }
    );

    expect(creativeOnly(merged)).toHaveLength(0);
  });

  it('removes creative duplicates of each other', () => {
    const merged = mergeCandidates(
      [],
      [
        { value: 'novelidea', kind: CreativeKind.BRANDABLE, confidence: 0.5, rationale: 'a' },
        { value: 'Novel-Idea', kind: CreativeKind.INVENTED, confidence: 0.5, rationale: 'b' },
        { value: 'novel-idea', kind: CreativeKind.PHONETIC, confidence: 0.5, rationale: 'c' },
      ],
      { seed: 'cloud' }
    );

    const labels = creativeOnly(merged).map((candidate) => candidate.label);
    expect(labels).toEqual(['novelidea']);
  });

  it('rejects invalid domain labels', () => {
    const merged = mergeCandidates(
      [],
      [
        { value: 'ab', kind: CreativeKind.COMPRESSED, confidence: 0.5, rationale: 'too short' },
        { value: 'bcdfgh', kind: CreativeKind.INVENTED, confidence: 0.5, rationale: 'no vowels' },
        {
          value: 'thisisaveryverylonglabelbeyondlimit',
          kind: CreativeKind.BRANDABLE,
          confidence: 0.5,
          rationale: 'too long',
        },
        { value: '###', kind: CreativeKind.PHONETIC, confidence: 0.5, rationale: 'empty' },
        { value: 'subcommand', kind: CreativeKind.CATEGORY_ADJACENT, confidence: 0.5, rationale: 'ok' },
      ],
      { seed: 'cloud' }
    );

    expect(creativeOnly(merged).map((candidate) => candidate.label)).toEqual(['subcommand']);
  });

  it('bounds creative confidence influence to ±5 points and leaves base components intact', () => {
    const scorer = new DomainScorer();
    const base = scorer.score('novelidea', 'cloud sync');

    const high = mergeCandidates(
      [],
      [{ value: 'novelidea', kind: CreativeKind.BRANDABLE, confidence: 1, rationale: 'high' }],
      { seed: 'cloud sync' }
    )[0] as EnrichedCreativeCandidate;

    const low = mergeCandidates(
      [],
      [{ value: 'novelidea', kind: CreativeKind.BRANDABLE, confidence: 0, rationale: 'low' }],
      { seed: 'cloud sync' }
    )[0] as EnrichedCreativeCandidate;

    expect(high.score.total).toBeLessThanOrEqual(base.total + MAX_CONFIDENCE_POINTS);
    expect(low.score.total).toBeGreaterThanOrEqual(base.total - MAX_CONFIDENCE_POINTS);
    // The authoritative metric components are untouched by confidence.
    expect(high.scoreComponents.total).toBe(base.total);
    expect(low.scoreComponents.total).toBe(base.total);
  });

  it('tags deterministic candidates and preserves their scores', () => {
    const deterministic = generateDomainCandidates({ seed: 'cloud', maxCandidates: 20 });
    const merged = mergeCandidates(deterministic, [], { seed: 'cloud' });

    expect(merged).toHaveLength(deterministic.length);
    for (const candidate of merged) {
      expect(candidate.origin).toBe('deterministic');
    }
    expect(merged[0].score.total).toBe(deterministic[0].score.total);
  });
});

describe('enrichSearchCandidates (search-level flow)', () => {
  it('performs exactly one creative model call per search', async () => {
    const model = new FakeCreativeModel(() => response([{ value: 'cloudlet' }]));

    await enrichSearchCandidates({ seed: 'cloud sync', model });

    expect(model.calls).toBe(1);
  });

  it('survives total creative failure and returns deterministic candidates', async () => {
    const model = new FakeCreativeModel(() => {
      throw new Error('total failure');
    });

    const result = await enrichSearchCandidates({ seed: 'cloud sync', model });

    expect(model.calls).toBe(1);
    expect(result.creative.degraded).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((candidate) => candidate.origin === 'deterministic')).toBe(
      true
    );
  });

  it('survives creative timeout and returns deterministic candidates', async () => {
    const model = new FakeCreativeModel(abortableNeverResponder);
    const enricher = new CreativeEnricher(model, { timeoutMs: 25 });

    const result = await enrichSearchCandidates({ seed: 'cloud sync', enricher });

    expect(result.creative.timedOut).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((candidate) => candidate.origin === 'deterministic')).toBe(
      true
    );
  });

  it('adds validated creative candidates to the ranked list', async () => {
    const model = new FakeCreativeModel(() =>
      response([
        { value: 'nimbusly', kind: CreativeKind.METAPHOR, confidence: 0.9, rationale: 'cloud-like' },
        { value: 'bcdfgh', kind: CreativeKind.INVENTED, confidence: 0.9, rationale: 'invalid' },
      ])
    );

    const result = await enrichSearchCandidates({ seed: 'cloud sync', model });

    const creative = creativeOnly(result.candidates);
    expect(creative.map((candidate) => candidate.label)).toContain('nimbusly');
    expect(result.creativeCount).toBe(creative.length);
    expect(result.candidates.length).toBeLessThanOrEqual(result.deterministicCount + creative.length);
  });

  it('skips the creative model entirely when none is configured', async () => {
    const result = await enrichSearchCandidates({ seed: 'cloud sync' });

    expect(result.creative.modelCalls).toBe(0);
    expect(result.creative.modelId).toBeNull();
    expect(result.candidates.every((candidate) => candidate.origin === 'deterministic')).toBe(
      true
    );
  });
});

describe('hermeticity', () => {
  it('keeps the creative core free of any external model SDK or network call', () => {
    const files = readdirSync(CREATIVE_DIR).filter((file) => file.endsWith('.ts'));

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(join(CREATIVE_DIR, file), 'utf-8');
      expect(source).not.toMatch(/@anthropic-ai/);
      expect(source).not.toMatch(/ANTHROPIC_API_KEY/);
      expect(source).not.toMatch(/openai/i);
      expect(source).not.toMatch(/\bfetch\s*\(/);
    }
  });

  // Any future live-model test must opt in explicitly; the default suite never
  // reaches out to a provider even when ANTHROPIC_API_KEY exists in the shell.
  const runLive = process.env.RUN_LLM_TESTS === '1';
  (runLive ? describe : describe.skip)('live creative model (opt-in)', () => {
    it('only runs when RUN_LLM_TESTS=1', () => {
      expect(process.env.RUN_LLM_TESTS).toBe('1');
    });
  });
});
