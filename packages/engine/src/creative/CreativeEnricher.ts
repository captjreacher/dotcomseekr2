import { parseCreativeResponse } from './schema.ts';
import {
  DEFAULT_CREATIVE_CACHE_ENTRIES,
  DEFAULT_CREATIVE_CACHE_TTL_MS,
  DEFAULT_CREATIVE_MAX_CANDIDATES,
  DEFAULT_CREATIVE_TIMEOUT_MS,
  type CreativeEnrichmentResult,
  type CreativeRequest,
  type ICreativeModel,
} from './types.ts';

export interface CreativeEnricherOptions {
  /** Hard deadline for a single model call. Default 12s. */
  timeoutMs?: number;
  /** Upper bound on candidates kept per search. Default 40. */
  maxCandidates?: number;
  /** Cache entry lifetime. Default 5 minutes. */
  cacheTtlMs?: number;
  /** Bounded cache size. Default 100 entries. */
  maxCacheEntries?: number;
}

/** Thrown internally when the enricher's own deadline fires. */
class CreativeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Creative model timed out after ${timeoutMs}ms`);
    this.name = 'CreativeTimeoutError';
  }
}

interface CacheEntry {
  result: CreativeEnrichmentResult;
  expiresAt: number;
}

function normalized(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Search-level cache key. Incorporates seed, use case, tone, exploration mode,
 * deterministic context and the candidate budget, so two searches that could
 * produce different creative output never share a cache entry.
 */
function cacheKey(request: CreativeRequest, maxCandidates: number): string {
  const context = request.deterministicContext ?? {};
  const rootTokens = [...(context.rootTokens ?? [])].map(normalized).sort();
  const topLabels = [...(context.topLabels ?? [])].map(normalized).sort();

  return JSON.stringify([
    normalized(request.seed),
    normalized(request.useCase),
    normalized(request.tone),
    request.explorationMode ?? '',
    rootTokens,
    topLabels,
    maxCandidates,
  ]);
}

/**
 * Wraps a provider-neutral {@link ICreativeModel} with:
 * - exactly one model invocation per search (soft-failed on any error),
 * - real cancellation: an AbortController is passed INTO the model and also
 *   raced against a local deadline, so a model that ignores the signal still
 *   cannot hang the search,
 * - a bounded, TTL'd, search-level cache.
 *
 * `enrich` never throws. On any failure it returns an empty, degraded result so
 * the caller can continue with deterministic candidates.
 */
export class CreativeEnricher {
  private readonly timeoutMs: number;
  private readonly maxCandidates: number;
  private readonly cacheTtlMs: number;
  private readonly maxCacheEntries: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly model: ICreativeModel,
    options: CreativeEnricherOptions = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_CREATIVE_TIMEOUT_MS;
    this.maxCandidates = options.maxCandidates ?? DEFAULT_CREATIVE_MAX_CANDIDATES;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CREATIVE_CACHE_TTL_MS;
    this.maxCacheEntries = options.maxCacheEntries ?? DEFAULT_CREATIVE_CACHE_ENTRIES;
  }

  get modelId(): string {
    return this.model.id;
  }

  /**
   * Run a single creative enrichment pass for one search.
   */
  async enrich(request: CreativeRequest): Promise<CreativeEnrichmentResult> {
    const key = cacheKey(request, this.maxCandidates);

    const cached = this.readCache(key);
    if (cached) {
      return { ...cached, fromCache: true, modelCalls: 0 };
    }

    const controller = new AbortController();
    const timeoutMs = this.timeoutMs;
    const deadline = this.deadline(timeoutMs, controller);

    try {
      const modelPromise = Promise.resolve(
        this.model.generate(request, {
          signal: controller.signal,
          timeoutMs,
          maxCandidates: this.maxCandidates,
        })
      );
      // If the deadline wins the race the model may still reject later (e.g.
      // with AbortError). Swallow that so it never becomes an unhandled
      // rejection; the meaningful path is handled below.
      modelPromise.catch(() => {});

      const response = await Promise.race([modelPromise, deadline.promise]);

      const candidates = parseCreativeResponse(response, this.maxCandidates);
      const degraded = candidates.length === 0;
      const result: CreativeEnrichmentResult = {
        candidates,
        modelId: this.model.id,
        fromCache: false,
        degraded,
        timedOut: false,
        modelCalls: 1,
        error: degraded ? 'Model returned no usable candidates' : undefined,
      };

      // Only cache healthy, non-empty results.
      if (!degraded) this.writeCache(key, result);
      return result;
    } catch (error) {
      const timedOut =
        error instanceof CreativeTimeoutError ||
        (error as { name?: string } | null)?.name === 'AbortError';
      return {
        candidates: [],
        modelId: this.model.id,
        fromCache: false,
        degraded: true,
        timedOut,
        modelCalls: 1,
        error: error instanceof Error ? error.message : 'Creative model failed',
      };
    } finally {
      deadline.cancel();
    }
  }

  /** Clear the bounded cache. */
  clearCache(): void {
    this.cache.clear();
  }

  /** Current number of live cache entries (expired entries excluded). */
  getCacheSize(): number {
    const now = Date.now();
    let size = 0;
    for (const entry of this.cache.values()) {
      if (entry.expiresAt > now) size += 1;
    }
    return size;
  }

  private deadline(
    timeoutMs: number,
    controller: AbortController
  ): { promise: Promise<never>; cancel: () => void } {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new CreativeTimeoutError(timeoutMs));
      }, timeoutMs);
    });

    return {
      promise,
      cancel: () => {
        if (timer !== undefined) clearTimeout(timer);
      },
    };
  }

  private readCache(key: string): CreativeEnrichmentResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.result;
  }

  private writeCache(key: string, result: CreativeEnrichmentResult): void {
    // Bounded size: evict the oldest (first-inserted) entry before growing.
    if (this.cache.size >= this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }
}
