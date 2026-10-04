import { normalizeLabel } from '../generation/strategies.ts';
import type { GenerationCandidate } from '../generation/types.ts';
import { isValidDomainName, isPronounceab } from '../recombiner/rules.ts';
import { DomainScorer } from '../scorer/DomainScorer.ts';
import {
  CREATIVE_KIND_LABELS,
  ExplorationMode,
  type CreativeCandidate,
  type CreativeProvenance,
  type EnrichedCandidate,
  type EnrichedCreativeCandidate,
  type EnrichedDeterministicCandidate,
} from './types.ts';

/** Maximum points a creative confidence value may move a deterministic score. */
export const MAX_CONFIDENCE_POINTS = 5;

const MIN_LABEL_LENGTH = 3;
const MAX_LABEL_LENGTH = 24;

export interface MergeOptions {
  seed: string;
  useCase?: string;
  tone?: string;
  explorationMode?: ExplorationMode;
  /** Model id recorded in creative provenance (observability only). */
  modelId?: string | null;
  /** Final cap on the combined ranked list. */
  maxCandidates?: number;
  minLength?: number;
  maxLength?: number;
}

/**
 * Validate a normalized creative label using the *deterministic* rules. The
 * model never gets to bypass these.
 */
export function isValidCreativeLabel(
  label: string,
  minLength: number = MIN_LABEL_LENGTH,
  maxLength: number = MAX_LABEL_LENGTH
): boolean {
  if (!label) return false;
  if (label.length < minLength || label.length > maxLength) return false;
  if (/\d/.test(label)) return false;
  if (!isValidDomainName(label)) return false;
  if (!isPronounceab(label)) return false;
  return true;
}

/**
 * Bounded confidence modifier. Mirrors the existing ±5 concept: confidence 0.5
 * is neutral, and the result never moves more than {@link MAX_CONFIDENCE_POINTS}
 * in either direction, so model confidence can nudge but never dominate.
 */
export function confidenceModifier(confidence: number): number {
  const clamped = Math.max(0, Math.min(1, confidence));
  const modifier = (clamped - 0.5) * (2 * MAX_CONFIDENCE_POINTS);
  return Math.max(-MAX_CONFIDENCE_POINTS, Math.min(MAX_CONFIDENCE_POINTS, modifier));
}

function toDeterministic(
  candidate: GenerationCandidate
): EnrichedDeterministicCandidate {
  return { ...candidate, origin: 'deterministic' };
}

/**
 * Combine deterministic candidates with creative candidates.
 *
 * Pipeline per creative candidate: normalize -> dedupe (against deterministic,
 * against earlier creative candidates, and against normalized-equivalent
 * forms) -> deterministic label validation -> DomainScorer -> bounded
 * confidence nudge. Deterministic candidates are always present, so total
 * model failure simply yields the deterministic list.
 */
export function mergeCandidates(
  deterministic: GenerationCandidate[],
  creative: CreativeCandidate[],
  options: MergeOptions
): EnrichedCandidate[] {
  const maxCandidates = Math.max(1, options.maxCandidates ?? Number.MAX_SAFE_INTEGER);
  const minLength = options.minLength ?? MIN_LABEL_LENGTH;
  const maxLength = options.maxLength ?? MAX_LABEL_LENGTH;
  const scorer = new DomainScorer();

  const combined: EnrichedCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of deterministic) {
    const normalized = normalizeLabel(candidate.label);
    if (normalized) seen.add(normalized);
    combined.push(toDeterministic(candidate));
  }

  for (const candidate of creative) {
    const label = normalizeLabel(candidate.value);
    if (!label) continue;

    // Dedupe: against deterministic labels, against prior creative candidates,
    // and against every normalized-equivalent form (normalizeLabel collapses
    // spaces/hyphens, so "cloud sync" and "cloud-sync" collide here).
    if (seen.has(label)) continue;
    if (!isValidCreativeLabel(label, minLength, maxLength)) continue;

    seen.add(label);

    const base = scorer.score(label, options.seed);
    const total = Math.max(
      0,
      Math.min(100, base.total + confidenceModifier(candidate.confidence))
    );

    const provenance: CreativeProvenance = {
      seed: options.seed,
      useCase: options.useCase,
      tone: options.tone,
      explorationMode: options.explorationMode ?? ExplorationMode.EXPLORATORY,
      kind: candidate.kind,
      modelId: options.modelId ?? null,
    };

    const enriched: EnrichedCreativeCandidate = {
      origin: 'creative',
      label,
      kind: candidate.kind,
      kindLabel: CREATIVE_KIND_LABELS[candidate.kind],
      confidence: candidate.confidence,
      rationale: candidate.rationale,
      score: { ...base, total: Math.round(total * 100) / 100 },
      scoreComponents: { ...base },
      provenance,
    };

    combined.push(enriched);
  }

  combined.sort((a, b) => {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    if (a.label !== b.label) return a.label < b.label ? -1 : 1;
    if (a.origin !== b.origin) return a.origin === 'deterministic' ? -1 : 1;
    return 0;
  });

  return combined.slice(0, maxCandidates);
}
