import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { generateDomainCandidates } from '../generation/generate';
import {
  GENERATION_STRATEGIES,
  STRATEGY_LABELS,
  ExpansionStrategy,
  type GenerationStrategy,
} from '../generation/types';
import { isValidDomainName, isPronounceab } from '../recombiner/rules';
import { DomainScorer } from '../scorer/DomainScorer';

const SIX_STRATEGIES: GenerationStrategy[] = [
  ExpansionStrategy.SYNONYM,
  ExpansionStrategy.RELATED,
  ExpansionStrategy.RHYME,
  ExpansionStrategy.PHONETIC_NEIGHBOR,
  ExpansionStrategy.MORPHOLOGICAL,
  ExpansionStrategy.ALLITERATIVE,
];

const EDGE_FUNCTION_PATH = fileURLToPath(
  new URL('../../../../supabase/functions/dotcomseekr-domain-search/index.ts', import.meta.url)
);
const EDGE_SHARED_PATH = fileURLToPath(
  new URL('../../../../supabase/functions/_shared/generation.ts', import.meta.url)
);

describe('Shared generation core', () => {
  describe('six deterministic strategies', () => {
    it('contributes candidates from every strategy plus the exact seed', () => {
      // "cloud" is present in the synonyms, related, rhymes and phonetics
      // lexicons, and its initial letter drives the alliterative strategy.
      const candidates = generateDomainCandidates({ seed: 'cloud', maxCandidates: 500 });
      const strategies = new Set(candidates.map((candidate) => candidate.strategy));

      expect(strategies.has('exact')).toBe(true);

      for (const strategy of SIX_STRATEGIES) {
        expect(strategies.has(strategy)).toBe(true);
        expect(candidates.some((candidate) => candidate.strategy === strategy)).toBe(true);
      }
    });

    it('labels every strategy with the human-readable strategy label', () => {
      const candidates = generateDomainCandidates({ seed: 'cloud', maxCandidates: 500 });

      for (const candidate of candidates) {
        expect(candidate.strategyLabel).toBe(STRATEGY_LABELS[candidate.strategy]);
      }
    });
  });

  describe('determinism', () => {
    it('returns identical output for the same input', () => {
      const options = { seed: 'cloud sync', tone: 'premium', useCase: 'developer tools' };
      const first = generateDomainCandidates(options);
      const second = generateDomainCandidates(options);

      expect(first).toEqual(second);
    });

    it('returns deterministically ranked output (score desc, label asc)', () => {
      const candidates = generateDomainCandidates({ seed: 'cloud' });

      for (let i = 1; i < candidates.length; i++) {
        const previous = candidates[i - 1];
        const current = candidates[i];
        expect(
          previous.score.total > current.score.total ||
            (previous.score.total === current.score.total && previous.label <= current.label)
        ).toBe(true);
      }
    });
  });

  describe('deduplication and label validity', () => {
    it('never emits duplicate labels', () => {
      const candidates = generateDomainCandidates({ seed: 'cloud', maxCandidates: 500 });
      const labels = candidates.map((candidate) => candidate.label);

      expect(new Set(labels).size).toBe(labels.length);
    });

    it('rejects invalid domain labels', () => {
      const candidates = generateDomainCandidates({ seed: 'cloud', maxCandidates: 500 });

      expect(candidates.length).toBeGreaterThan(0);
      for (const candidate of candidates) {
        expect(isValidDomainName(candidate.label)).toBe(true);
        expect(isPronounceab(candidate.label)).toBe(true);
        expect(candidate.label.length).toBeGreaterThanOrEqual(3);
        expect(/\d/.test(candidate.label)).toBe(false);
      }
    });
  });

  describe('scoring', () => {
    it('applies the shared DomainScorer to every candidate', () => {
      const scorer = new DomainScorer();
      const candidates = generateDomainCandidates({ seed: 'cloud' });

      expect(candidates.length).toBeGreaterThan(0);

      for (const candidate of candidates) {
        expect(candidate.score).toEqual(scorer.score(candidate.label, 'cloud'));
        expect(candidate.score.total).toBeGreaterThanOrEqual(0);
        expect(candidate.score.total).toBeLessThanOrEqual(100);
        expect(candidate.scoreComponents).toEqual(candidate.score);
      }
    });

    it('exposes provenance metadata for the UI contract', () => {
      const candidates = generateDomainCandidates({ seed: 'cloud', useCase: 'developer tools' });
      const first = candidates[0];

      expect(first.sourceTerm).toBeTruthy();
      expect(first.rationale).toBeTruthy();
      expect(first.provenance.seed).toBe('cloud');
      expect(Array.isArray(first.provenance.rootTokens)).toBe(true);
    });
  });

  describe('strategy registry', () => {
    it('lists the exact seed plus the six strategies in a stable order', () => {
      expect(GENERATION_STRATEGIES).toEqual(['exact', ...SIX_STRATEGIES]);
    });
  });
});

describe('Edge function wiring', () => {
  const source = readFileSync(EDGE_FUNCTION_PATH, 'utf-8');
  const sharedSource = readFileSync(EDGE_SHARED_PATH, 'utf-8');

  it('generates candidates through the shared engine instead of inline logic', () => {
    expect(source).toContain('_shared/generation.ts');
    expect(source).toContain('generateDomainCandidates(');
  });

  it('exposes the single engine core through the shared module without forking it', () => {
    expect(sharedSource).toContain('packages/engine/src/generation/index.ts');
    // The shared module must stay a re-export, never a second implementation.
    expect(sharedSource).not.toContain('function generateDomainCandidates');
    expect(sharedSource).not.toContain('const LEXICON_DATA');
  });

  it('no longer contains the retired inline generation implementation', () => {
    expect(source).not.toContain('buildDomainCandidates');
    expect(source).not.toContain('candidateStrategyOrder');
  });

  it('keeps the registrar providers and the 36-domain check cap untouched', () => {
    expect(source).toContain('function createDynadotProvider');
    expect(source).toContain('function createNamecheapProvider');
    expect(source).toContain('function createPreferredProvider');
    expect(source).toContain('const maxDomainsPerSearch = 36;');
  });
});
