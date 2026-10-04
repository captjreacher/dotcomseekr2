import type { DomainScore } from '@dotcomseekr/shared';
import type { GenerationCandidate } from '../generation/types.ts';

/**
 * Provider-neutral creative enrichment contracts.
 *
 * This module deliberately knows nothing about any specific model vendor. A
 * concrete model (a hosted API, a local model, or a fake) only has to implement
 * {@link ICreativeModel}; everything downstream — caching, timeout, validation,
 * dedupe, scoring — lives in the runtime-neutral engine and is identical no
 * matter which model is plugged in.
 */

/**
 * Controlled vocabulary describing *how* a creative candidate was discovered.
 * Using an enum (rather than arbitrary strings) keeps the vocabulary small and
 * lets deterministic validation reject anything outside it.
 */
export enum CreativeKind {
  SEMANTIC = 'semantic',
  METAPHOR = 'metaphor',
  CATEGORY_ADJACENT = 'category_adjacent',
  PORTMANTEAU = 'portmanteau',
  COMPRESSED = 'compressed',
  PHONETIC = 'phonetic',
  INVENTED = 'invented',
  ACTION = 'action',
  OUTCOME = 'outcome',
  BRANDABLE = 'brandable',
}

/** Single source of truth for the supported creative directions. */
export const CREATIVE_KINDS: readonly CreativeKind[] = Object.values(CreativeKind);

export const CREATIVE_KIND_LABELS: Record<CreativeKind, string> = {
  [CreativeKind.SEMANTIC]: 'Semantic association',
  [CreativeKind.METAPHOR]: 'Metaphor',
  [CreativeKind.CATEGORY_ADJACENT]: 'Category-adjacent',
  [CreativeKind.PORTMANTEAU]: 'Portmanteau',
  [CreativeKind.COMPRESSED]: 'Compressed',
  [CreativeKind.PHONETIC]: 'Phonetic wordplay',
  [CreativeKind.INVENTED]: 'Invented',
  [CreativeKind.ACTION]: 'Action',
  [CreativeKind.OUTCOME]: 'Outcome',
  [CreativeKind.BRANDABLE]: 'Brandable',
};

/**
 * How far the model is encouraged to wander from the seed. Mirrors the legacy
 * exploration modes so existing UI options keep working.
 */
export enum ExplorationMode {
  SAFE = 'SAFE',
  EXPLORATORY = 'EXPLORATORY',
  ADVENTUROUS = 'ADVENTUROUS',
}

/** Tone modifiers. Free-form strings are accepted but these are canonical. */
export enum ToneModifier {
  TECHNICAL = 'TECHNICAL',
  BRANDABLE = 'BRANDABLE',
  PLAYFUL = 'PLAYFUL',
  PROFESSIONAL = 'PROFESSIONAL',
  MODERN = 'MODERN',
}

/** A single creative idea returned by a model. */
export interface CreativeCandidate {
  /** The raw idea (a word, compression, portmanteau, etc.). Not yet a label. */
  value: string;
  /** Which creative direction produced it. */
  kind: CreativeKind;
  /** Self-reported confidence (0..1). Used only as a bounded nudge, never as authority. */
  confidence: number;
  /** Short, human-readable explanation of the idea. */
  rationale: string;
}

/**
 * Useful deterministic context handed to the model. This is guidance only; the
 * model may not override deterministic rules with it.
 */
export interface DeterministicContext {
  /** Root tokens the deterministic core expanded from. */
  rootTokens?: string[];
  /** A small sample of already-generated labels, so the model can avoid them. */
  topLabels?: string[];
}

/**
 * One search-level creative request. Note there is exactly one of these per
 * search — the model is asked to explore the whole naming problem, not to be
 * called once per token.
 */
export interface CreativeRequest {
  seed: string;
  useCase?: string;
  tone?: string;
  explorationMode?: ExplorationMode;
  deterministicContext?: DeterministicContext;
  maxCandidates?: number;
}

/** The model's structured response. */
export interface CreativeResponse {
  candidates: CreativeCandidate[];
}

/** Per-call options passed to the model (cancellation + budget). */
export interface CreativeModelOptions {
  /** Aborts the underlying request when the enricher's timeout elapses. */
  signal?: AbortSignal;
  /** Soft deadline the model should respect; the enricher also enforces it. */
  timeoutMs?: number;
  /** Upper bound on how many candidates the enricher will keep. */
  maxCandidates?: number;
}

/**
 * Provider-neutral creative model. Implementations must not expose
 * vendor-specific types beyond this interface.
 */
export interface ICreativeModel {
  /** Stable identifier, surfaced for observability (never used in scoring). */
  readonly id: string;
  generate(
    request: CreativeRequest,
    options?: CreativeModelOptions
  ): Promise<CreativeResponse>;
}

export const DEFAULT_CREATIVE_TIMEOUT_MS = 12_000;
export const DEFAULT_CREATIVE_MAX_CANDIDATES = 40;
export const DEFAULT_CREATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_CREATIVE_CACHE_ENTRIES = 100;

/** Result of a single enrichment pass, including degraded-state metadata. */
export interface CreativeEnrichmentResult {
  /** Validated candidates (before merge/dedupe with deterministic output). */
  candidates: CreativeCandidate[];
  /** Id of the model that served this result, or null when none was used. */
  modelId: string | null;
  /** True when the result came from the bounded cache. */
  fromCache: boolean;
  /** True when the model failed, timed out, or produced no usable candidates. */
  degraded: boolean;
  /** True specifically when cancellation/timeout occurred. */
  timedOut: boolean;
  /** Failure detail when degraded. Never thrown to callers. */
  error?: string;
  /** Number of model invocations attributable to this result (0 when cached). */
  modelCalls: number;
}

/** Provenance for a creative candidate after it has been scored. */
export interface CreativeProvenance {
  seed: string;
  useCase?: string;
  tone?: string;
  explorationMode: ExplorationMode;
  kind: CreativeKind;
  modelId: string | null;
}

/** A deterministic candidate, tagged so it shares one ranked list with creative output. */
export interface EnrichedDeterministicCandidate extends GenerationCandidate {
  origin: 'deterministic';
}

/** A creative candidate that survived normalization, validation and scoring. */
export interface EnrichedCreativeCandidate {
  origin: 'creative';
  label: string;
  kind: CreativeKind;
  kindLabel: string;
  confidence: number;
  rationale: string;
  score: DomainScore;
  scoreComponents: DomainScore;
  provenance: CreativeProvenance;
}

export type EnrichedCandidate =
  | EnrichedDeterministicCandidate
  | EnrichedCreativeCandidate;

/** The full ranked result of a creative-enriched search. */
export interface CreativeSearchResult {
  candidates: EnrichedCandidate[];
  creative: CreativeEnrichmentResult;
  deterministicCount: number;
  creativeCount: number;
}
