import { generateDomainCandidates } from '../generation/generate.ts';
import type {
  GenerateDomainCandidatesOptions,
  GenerationCandidate,
} from '../generation/types.ts';
import { CreativeEnricher } from './CreativeEnricher.ts';
import { mergeCandidates } from './merge.ts';
import {
  ExplorationMode,
  type CreativeEnrichmentResult,
  type CreativeRequest,
  type CreativeSearchResult,
  type DeterministicContext,
  type ICreativeModel,
} from './types.ts';

export interface CreativeSearchOptions extends GenerateDomainCandidatesOptions {
  explorationMode?: ExplorationMode;
  /** Provider-neutral model. When absent the search is deterministic-only. */
  model?: ICreativeModel;
  /** Pre-built enricher (shares its cache across searches). Takes precedence over `model`. */
  enricher?: CreativeEnricher;
  /** Extra context to hand the model. Defaults to deterministic output. */
  deterministicContext?: DeterministicContext;
  /** Candidate budget for the creative request (independent of the final cap). */
  creativeMaxCandidates?: number;
}

const EMPTY_CREATIVE_RESULT: CreativeEnrichmentResult = {
  candidates: [],
  modelId: null,
  fromCache: false,
  degraded: false,
  timedOut: false,
  modelCalls: 0,
};

/** Derive useful deterministic context from already-generated candidates. */
export function buildDeterministicContext(
  candidates: GenerationCandidate[],
  topN = 10
): DeterministicContext {
  return {
    rootTokens: candidates[0]?.provenance.rootTokens ?? [],
    topLabels: candidates.slice(0, topN).map((candidate) => candidate.label),
  };
}

/**
 * The target flow for a single search:
 *
 *   deterministic generation  ─┐
 *   CreativeEnricher (ONE call) ─┤→ merge/dedupe/validate/score → ranked list
 *
 * Creative enrichment is best-effort. Any model failure, timeout, malformed
 * payload, or empty result degrades gracefully to the deterministic list; this
 * function never throws because of the model.
 */
export async function enrichSearchCandidates(
  options: CreativeSearchOptions
): Promise<CreativeSearchResult> {
  const seed = String(options.seed ?? '').trim();
  const maxCandidates = options.maxCandidates;

  const deterministic = generateDomainCandidates({
    seed,
    tone: options.tone,
    useCase: options.useCase,
    maxCandidates,
  });

  const enricher =
    options.enricher ?? (options.model ? new CreativeEnricher(options.model) : null);

  let creative: CreativeEnrichmentResult = EMPTY_CREATIVE_RESULT;

  if (enricher) {
    const request: CreativeRequest = {
      seed,
      useCase: options.useCase,
      tone: options.tone,
      explorationMode: options.explorationMode,
      deterministicContext:
        options.deterministicContext ?? buildDeterministicContext(deterministic),
      maxCandidates: options.creativeMaxCandidates,
    };

    try {
      creative = await enricher.enrich(request);
    } catch (error) {
      // CreativeEnricher already swallows failures; this is defence in depth.
      creative = {
        ...EMPTY_CREATIVE_RESULT,
        modelId: enricher.modelId,
        degraded: true,
        error: error instanceof Error ? error.message : 'Creative enrichment failed',
      };
    }
  }

  const candidates = mergeCandidates(deterministic, creative.candidates, {
    seed,
    useCase: options.useCase,
    tone: options.tone,
    explorationMode: options.explorationMode,
    modelId: creative.modelId,
    maxCandidates,
  });

  return {
    candidates,
    creative,
    deterministicCount: deterministic.length,
    creativeCount: candidates.filter((candidate) => candidate.origin === 'creative').length,
  };
}
