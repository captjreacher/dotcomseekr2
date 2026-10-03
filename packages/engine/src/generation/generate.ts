import { PhraseSplitter } from '../expander/PhraseSplitter.ts';
import { Recombiner } from '../recombiner/Recombiner.ts';
import { DomainScorer } from '../scorer/DomainScorer.ts';
import { PortableLexicon } from './lexicon.ts';
import { LEXICON_DATA } from './lexicon-data.ts';
import { expandTerms, normalizeLabel, type ExpandedTerm } from './strategies.ts';
import {
  STRATEGY_LABELS,
  type GenerateDomainCandidatesOptions,
  type GenerationCandidate,
  type GenerationStrategy,
} from './types.ts';

const DEFAULT_MAX_CANDIDATES = 250;
const RECOMBINATION_LIMIT = 1500;
const MIN_LABEL_LENGTH = 3;
const MAX_LABEL_LENGTH = 24;

function rationaleFor(strategy: GenerationStrategy, sourceTerm: string): string {
  switch (strategy) {
    case 'exact':
      return `Uses "${sourceTerm}" directly as the seed idea`;
    case 'SYNONYM':
      return `Borrows a synonym of "${sourceTerm}" for a familiar but distinct name`;
    case 'RELATED':
      return `Pulls in the related concept "${sourceTerm}"`;
    case 'RHYME':
      return `Plays on the rhyme "${sourceTerm}" for a catchy feel`;
    case 'PHONETIC_NEIGHBOR':
      return `Uses the phonetic cousin "${sourceTerm}" for an easy-to-recall name`;
    case 'MORPHOLOGICAL':
      return `Builds on "${sourceTerm}" with a prefix or suffix`;
    case 'ALLITERATIVE':
      return `Alliterates with "${sourceTerm}" for a memorable ring`;
    default:
      return `Derived from "${sourceTerm}"`;
  }
}

function findProvenance(
  label: string,
  terms: ExpandedTerm[],
  index: Map<string, ExpandedTerm>,
  fallback: ExpandedTerm | undefined
): ExpandedTerm | undefined {
  const exact = index.get(label);
  if (exact) return exact;

  let best: ExpandedTerm | undefined;
  for (const term of terms) {
    if (term.value.length < MIN_LABEL_LENGTH) continue;
    if (label.startsWith(term.value) && (!best || term.value.length > best.value.length)) {
      best = term;
    }
  }

  return best ?? fallback;
}

/**
 * Deterministic, runtime-agnostic domain generation.
 *
 * seed keyword -> six expansion strategies -> recombination -> DomainScorer ->
 * ranked candidates with full provenance metadata.
 */
export function generateDomainCandidates(
  options: GenerateDomainCandidatesOptions
): GenerationCandidate[] {
  const seed = String(options.seed ?? '').trim();
  if (!seed) return [];

  const tone = String(options.tone ?? '').trim();
  const useCase = String(options.useCase ?? '').trim();
  const maxCandidates = Math.max(1, options.maxCandidates ?? DEFAULT_MAX_CANDIDATES);

  const lexicon = new PortableLexicon(LEXICON_DATA);
  const splitter = new PhraseSplitter(lexicon.getAllStopwords());

  const seedTokens = splitter
    .split(seed, { removeStopwords: true })
    .filter((token) => !lexicon.isBlocked(token));
  const useCaseTokens = useCase
    ? splitter
        .split(useCase, { removeStopwords: true })
        .filter((token) => !lexicon.isBlocked(token))
    : [];

  const rootTokens = [...new Set([...seedTokens, ...useCaseTokens])];
  if (rootTokens.length === 0) return [];

  const compact = normalizeLabel(seed);
  const terms = expandTerms(rootTokens, lexicon);

  if (
    compact.length >= MIN_LABEL_LENGTH &&
    !lexicon.isBlocked(compact) &&
    !terms.some((term) => term.value === compact)
  ) {
    terms.unshift({ value: compact, strategy: 'exact', sourceTerm: seed });
  }

  const termIndex = new Map(terms.map((term) => [term.value, term]));
  const fallbackTerm = terms.find((term) => term.strategy === 'exact');

  const recombiner = new Recombiner();
  const labels = recombiner.recombineWithOptions(
    terms.map((term) => term.value),
    {
      maxLength: MAX_LABEL_LENGTH,
      minLength: MIN_LABEL_LENGTH,
      maxCandidates: RECOMBINATION_LIMIT,
      allowHyphens: false,
      allowNumbers: false,
    }
  );

  const scorer = new DomainScorer();
  const candidates: GenerationCandidate[] = [];
  const seen = new Set<string>();

  for (const label of labels) {
    if (seen.has(label)) continue;
    seen.add(label);

    const provenanceTerm = findProvenance(label, terms, termIndex, fallbackTerm);
    if (!provenanceTerm) continue;

    const score = scorer.score(label, seed);

    candidates.push({
      label,
      strategy: provenanceTerm.strategy,
      strategyLabel: STRATEGY_LABELS[provenanceTerm.strategy],
      sourceTerm: provenanceTerm.sourceTerm,
      rationale: rationaleFor(provenanceTerm.strategy, provenanceTerm.sourceTerm),
      score,
      scoreComponents: { ...score },
      provenance: {
        seed,
        strategy: provenanceTerm.strategy,
        sourceTerm: provenanceTerm.sourceTerm,
        rootTokens,
        expansionDepth: 1,
        tone,
        useCase,
      },
    });
  }

  candidates.sort((a, b) => {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });

  return candidates.slice(0, maxCandidates);
}
