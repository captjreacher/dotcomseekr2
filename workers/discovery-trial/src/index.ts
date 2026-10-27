// Isolated Cloudflare Workers AI trial for DotcomSeekr guided discovery.
//
// POST /v1/variations has the same request/response contract as the existing
// Supabase `dotcomseekr-discovery` variations action. The browser never sees a
// Cloudflare credential: it presents a tester access code and a pseudonymous
// session id, both checked here. Every provider call (including retries) is
// recorded in D1. There is no fallback to the existing OpenAI integration.
import {
  buildVariationPrompt,
  buildVariationSchema,
} from '../../../apps/web/src/lib/discovery/prompt.ts';
import { joinLabel } from '../../../apps/web/src/lib/discovery/domains.ts';
import { TECHNIQUES, techniqueAvailable } from '../../../apps/web/src/lib/discovery/techniques.ts';
import {
  lexicalTermsForRound,
  noResultsMessage,
  sanitizeVariations,
} from '../../../apps/web/src/lib/discovery/variations.ts';
import type { Technique } from '../../../apps/web/src/lib/discovery/types.ts';
import {
  PROMPT_VERSION,
  TECHNIQUE_VERSION,
  VALIDATOR_VERSION,
} from '../../../apps/web/src/lib/discovery/versions.ts';
import {
  DEFAULT_MODEL,
  PRICING_DATE,
  PRICING_SOURCE,
  configuredModel,
  configuredProvider,
} from './pricing.ts';
import { MODEL_TIMEOUT_MS, ProviderError, createModel, type VariationModel } from './provider.ts';
import {
  authoriseTrial,
  dayStartIso,
  evaluateLimits,
  parseTrialLimits,
  readUsageCounters,
} from './trial.ts';
import { createLexicalVerifier, type LexicalBatch, type LexicalVerifier } from './lexical.ts';
import { recordAttempt } from './usage.ts';
import type { D1Database, Env } from './types.ts';

const MAX_BODY_BYTES = 16_384;
const MAX_ATTEMPTS = 2;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowedOrigins(env: Env): string[] {
  return (env.TRIAL_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> | null {
  if (!origin) return {};

  if (!allowedOrigins(env).includes(origin)) return null;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-trial-key, x-trial-session',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function fail(
  status: number,
  error: string,
  code: string,
  headers: Record<string, string>,
  extra: Record<string, unknown> = {}
): Response {
  return json({ error, code, ...extra }, status, headers);
}

function text(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function readTechnique(value: unknown): Technique | null {
  return typeof value === 'string' && (TECHNIQUES as readonly string[]).includes(value)
    ? (value as Technique)
    : null;
}

function previousSpellings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readTurnId(value: unknown): string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
    ? value.toLowerCase()
    : crypto.randomUUID();
}

/** The model payload must contain an array; an empty array is a valid empty round. */
function rawVariations(parsed: unknown): unknown[] | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const value = (parsed as { variations?: unknown }).variations;
  return Array.isArray(value) ? value : null;
}

function lexicalMetadata(batch: LexicalBatch | null): Record<string, unknown> | undefined {
  if (!batch) return undefined;

  return {
    status: batch.status,
    source: batch.source,
    license: batch.license,
    licenseUrl: batch.licenseUrl,
    verified: batch.status === 'ok',
    calls: batch.calls,
    cacheHits: batch.cacheHits,
    latencyMs: batch.latencyMs,
    costUsd: 0,
    ...(batch.error ? { error: batch.error } : {}),
  };
}

function trialMetadata(
  turnId: string,
  providerCalls: number,
  rejectedCount: number | null,
  acceptedCount: number | null,
  lexical: LexicalBatch | null
): Record<string, unknown> {
  return {
    turnId,
    providerCalls,
    rejectedCount,
    acceptedCount,
    lexicalCalls: lexical?.calls ?? 0,
    lexicalCacheHits: lexical?.cacheHits ?? 0,
    lexicalLatencyMs: lexical?.latencyMs ?? 0,
  };
}

function accountingFailure(
  headers: Record<string, string>,
  turnId: string,
  providerCalls: number
): Response {
  console.error('trial accounting failed', { turnId, providerCalls });
  return fail(
    503,
    'The trial could not record this request, so no suggestions were returned.',
    'trial_accounting_failed',
    headers,
    { trial: { turnId, providerCalls } }
  );
}

function providerErrorResponse(
  error: ProviderError,
  headers: Record<string, string>,
  turnId: string,
  providerCalls: number,
  model: VariationModel
): Response {
  return fail(error.httpStatus, error.message, error.code, headers, {
    provider: model.provider,
    model: model.model,
    providerStatus: error.providerStatus,
    trial: { turnId, providerCalls },
  });
}

export interface HandlerDeps {
  /** Test seam; production builds use the D1-backed Wiktionary verifier. */
  lexical?: LexicalVerifier;
}

async function handleVariations(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  deps: HandlerDeps
): Promise<Response> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return fail(
      413,
      'The request is too large for this trial endpoint.',
      'request_too_large',
      headers
    );
  }

  const auth = await authoriseTrial(request.headers, env);
  if (!auth.ok) return fail(auth.status, auth.message, auth.code, headers);

  if (!env.USAGE_DB) {
    return fail(
      503,
      'The trial cannot record usage, so suggestions are disabled.',
      'trial_accounting_unavailable',
      headers
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fail(400, 'Send a JSON object.', 'invalid_request', headers);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, 'Send valid JSON.', 'invalid_request', headers);
  }

  if (body.action !== undefined && body.action !== 'variations') {
    return fail(400, 'This endpoint only generates naming variations.', 'invalid_action', headers);
  }

  const technique = readTechnique(body.technique);
  if (!technique)
    return fail(400, 'Choose an exploration technique.', 'invalid_technique', headers);

  const mode: 'word' | 'phrase' = body.mode === 'phrase' ? 'phrase' : 'word';
  const original = text(body.original, 80);
  const workingName = text(body.workingName, 80) || original;

  if (!joinLabel(workingName)) {
    return fail(400, 'A valid working name is required.', 'invalid_working_name', headers);
  }

  if (!techniqueAvailable(technique, mode)) {
    return fail(
      400,
      'Hyphens need a multi-word name. A single word has no word boundary to hyphenate.',
      'technique_unavailable',
      headers
    );
  }

  const turnId = readTurnId(body.turnId);
  const limits = parseTrialLimits(env);
  const counters = await readUsageCounters(
    env.USAGE_DB,
    auth.identity.sessionRef,
    dayStartIso(new Date())
  );
  const decision = evaluateLimits(counters, limits);

  if (!decision.allowed) {
    return fail(
      429,
      decision.message ?? 'The trial allowance is used up.',
      'trial_limit',
      headers,
      {
        limit: decision.limit,
        trial: { turnId, providerCalls: 0 },
      }
    );
  }

  let model: VariationModel;
  try {
    model = createModel(env);
  } catch (error) {
    if (error instanceof ProviderError) {
      return fail(error.httpStatus, error.message, error.code, headers, {
        provider: configuredProvider(env),
        model: configuredModel(env) || DEFAULT_MODEL,
      });
    }
    return fail(502, 'The trial provider could not be configured.', 'ai_unconfigured', headers);
  }

  const { system, user } = buildVariationPrompt(body, technique);
  const prompt = { system, user, schema: buildVariationSchema(technique, mode, workingName) };
  const previous = previousSpellings(body.previous);
  const lexicalVerifier = deps.lexical ?? createLexicalVerifier(env.USAGE_DB);
  let lastError: ProviderError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const attemptStarted = Date.now();

    try {
      const output = await model.generate(prompt, {
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      });
      const latencyMs = Date.now() - attemptStarted;
      const raw = rawVariations(output.parsed);

      if (!raw) {
        try {
          await recordAttempt(env.USAGE_DB, {
            turnId,
            sessionRef: auth.identity.sessionRef,
            technique,
            mode,
            provider: model.provider,
            model: model.model,
            attempt,
            outcome: 'validation_rejected',
            httpStatus: 502,
            errorCode: 'ai_invalid_output',
            providerStatus: null,
            inputTokens: output.inputTokens,
            outputTokens: output.outputTokens,
            totalTokens: output.totalTokens,
            billedUnits: output.billedUnits,
            billedUnitName: output.billedUnitName,
            latencyMs,
            rejectedCount: 0,
            acceptedCount: 0,
            lexicalCalls: null,
            lexicalCacheHits: null,
            lexicalLatencyMs: null,
            lexicalCostUsd: null,
          });
        } catch {
          return accountingFailure(headers, turnId, attempt);
        }

        return fail(
          502,
          'The AI answer was not in the expected JSON shape.',
          'ai_invalid_output',
          headers,
          {
            technique,
            provider: model.provider,
            model: model.model,
            trial: trialMetadata(turnId, attempt, 0, 0, null),
          }
        );
      }

      const context = {
        technique,
        mode,
        workingName,
        original,
        meaning: text(body.meaning, 400),
        commentary: text(body.commentary, 400),
        previous,
      };
      const lexicalTerms = lexicalTermsForRound(output.parsed, context);
      let lexical: LexicalBatch | null = null;

      if (lexicalTerms.length > 0) {
        lexical = await lexicalVerifier.lookup(lexicalTerms);

        if (lexical.status !== 'ok') {
          try {
            await recordAttempt(env.USAGE_DB, {
              turnId,
              sessionRef: auth.identity.sessionRef,
              technique,
              mode,
              provider: model.provider,
              model: model.model,
              attempt,
              outcome: 'validation_rejected',
              httpStatus: 503,
              errorCode: 'lexical_unavailable',
              providerStatus: null,
              inputTokens: output.inputTokens,
              outputTokens: output.outputTokens,
              totalTokens: output.totalTokens,
              billedUnits: output.billedUnits,
              billedUnitName: output.billedUnitName,
              latencyMs,
              rejectedCount: raw.length,
              acceptedCount: 0,
              lexicalCalls: lexical.calls,
              lexicalCacheHits: lexical.cacheHits,
              lexicalLatencyMs: lexical.latencyMs,
              lexicalCostUsd: 0,
            });
          } catch {
            return accountingFailure(headers, turnId, attempt);
          }

          return fail(
            503,
            'Real-word verification is unavailable right now, so no suggestions were returned rather than showing unverified names.',
            'lexical_unavailable',
            headers,
            {
              technique,
              provider: model.provider,
              model: model.model,
              lexical: lexicalMetadata(lexical),
              trial: trialMetadata(turnId, attempt, raw.length, 0, lexical),
            }
          );
        }
      }

      const { variations, rejected } = sanitizeVariations(output.parsed, {
        ...context,
        recognised: lexical?.recognized,
      });

      if (variations.length === 0) {
        const emptyModel = raw.length === 0;
        const message = emptyModel
          ? 'The model returned no suggestions for this round. Try again, refine the meaning and commentary, or choose another technique.'
          : noResultsMessage(technique);
        const reason = emptyModel ? 'empty_model_response' : 'quality_no_results';

        try {
          await recordAttempt(env.USAGE_DB, {
            turnId,
            sessionRef: auth.identity.sessionRef,
            technique,
            mode,
            provider: model.provider,
            model: model.model,
            attempt,
            outcome: 'validation_rejected',
            httpStatus: 200,
            errorCode: emptyModel ? 'ai_no_suggestions' : 'quality_no_results',
            providerStatus: null,
            inputTokens: output.inputTokens,
            outputTokens: output.outputTokens,
            totalTokens: output.totalTokens,
            billedUnits: output.billedUnits,
            billedUnitName: output.billedUnitName,
            latencyMs,
            rejectedCount: rejected.length,
            acceptedCount: 0,
            lexicalCalls: lexical?.calls ?? null,
            lexicalCacheHits: lexical?.cacheHits ?? null,
            lexicalLatencyMs: lexical?.latencyMs ?? null,
            lexicalCostUsd: lexical ? 0 : null,
          });
        } catch {
          return accountingFailure(headers, turnId, attempt);
        }

        return json(
          {
            technique,
            mode,
            workingName,
            variations: [],
            rejected,
            noResults: { reason, message },
            provider: model.provider,
            model: model.model,
            generatedAt: new Date().toISOString(),
            lexical: lexicalMetadata(lexical),
            trial: trialMetadata(turnId, attempt, rejected.length, 0, lexical),
          },
          200,
          headers
        );
      }

      try {
        await recordAttempt(env.USAGE_DB, {
          turnId,
          sessionRef: auth.identity.sessionRef,
          technique,
          mode,
          provider: model.provider,
          model: model.model,
          attempt,
          outcome: 'success',
          httpStatus: 200,
          errorCode: null,
          providerStatus: null,
          inputTokens: output.inputTokens,
          outputTokens: output.outputTokens,
          totalTokens: output.totalTokens,
          billedUnits: output.billedUnits,
          billedUnitName: output.billedUnitName,
          latencyMs,
          rejectedCount: rejected.length,
          acceptedCount: variations.length,
          lexicalCalls: lexical?.calls ?? null,
          lexicalCacheHits: lexical?.cacheHits ?? null,
          lexicalLatencyMs: lexical?.latencyMs ?? null,
          lexicalCostUsd: lexical ? 0 : null,
        });
      } catch {
        // Fail closed: suggestions are not returned if their usage could not be
        // recorded, because that would make the trial's cost unknowable.
        return accountingFailure(headers, turnId, attempt);
      }

      return json(
        {
          technique,
          mode,
          workingName,
          variations,
          rejected,
          provider: model.provider,
          model: model.model,
          generatedAt: new Date().toISOString(),
          lexical: lexicalMetadata(lexical),
          trial: trialMetadata(turnId, attempt, rejected.length, variations.length, lexical),
        },
        200,
        headers
      );
    } catch (error) {
      const providerError =
        error instanceof ProviderError
          ? error
          : new ProviderError(
              'ai_error',
              'The AI provider could not complete this request. Try again.',
              502,
              true
            );
      const latencyMs = Date.now() - attemptStarted;

      try {
        await recordAttempt(env.USAGE_DB, {
          turnId,
          sessionRef: auth.identity.sessionRef,
          technique,
          mode,
          provider: model.provider,
          model: model.model,
          attempt,
          outcome: 'provider_error',
          httpStatus: providerError.httpStatus,
          errorCode: providerError.code,
          providerStatus: providerError.providerStatus,
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          billedUnits: null,
          billedUnitName: null,
          latencyMs,
          rejectedCount: null,
          acceptedCount: null,
          lexicalCalls: null,
          lexicalCacheHits: null,
          lexicalLatencyMs: null,
          lexicalCostUsd: null,
        });
      } catch {
        console.error('trial accounting failed', { turnId, attempt });
      }

      lastError = providerError;

      if (providerError.retryable && attempt < MAX_ATTEMPTS) continue;

      return providerErrorResponse(providerError, headers, turnId, attempt, model);
    }
  }

  // The loop always returns; this keeps TypeScript honest about `lastError`.
  const finalError =
    lastError ??
    new ProviderError('ai_error', 'The AI provider could not complete this request.', 502, false);
  return providerErrorResponse(finalError, headers, turnId, MAX_ATTEMPTS, model);
}

async function handleRequest(
  request: Request,
  env: Env,
  deps: HandlerDeps = {}
): Promise<Response> {
  const origin = request.headers.get('origin');
  const cors = corsHeaders(origin, env);

  if (cors === null) {
    return fail(403, 'This origin is not allowed to use the trial.', 'origin_not_allowed', {});
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'GET' && (path === '/' || path === '/v1/health')) {
    return json(
      {
        service: 'dotcomseekr-discovery-trial',
        status: 'ok',
        provider: configuredProvider(env),
        model: configuredModel(env) || DEFAULT_MODEL,
        sourceSha: env.SOURCE_SHA?.trim() || 'unknown',
        deploymentVersion: env.DEPLOYMENT_VERSION?.trim() || 'unknown',
        promptVersion: PROMPT_VERSION,
        validatorVersion: VALIDATOR_VERSION,
        techniqueVersion: TECHNIQUE_VERSION,
        pricing: { source: PRICING_SOURCE, retrieved: PRICING_DATE },
        time: new Date().toISOString(),
      },
      200,
      cors
    );
  }

  if (path !== '/v1/variations') {
    return fail(404, 'Not found.', 'not_found', cors);
  }

  if (request.method !== 'POST') {
    return fail(405, 'Method not allowed.', 'method_not_allowed', {
      ...cors,
      Allow: 'POST, OPTIONS',
    });
  }

  try {
    return await handleVariations(request, env, cors, deps);
  } catch (error) {
    // Never echo provider or binding internals to the browser.
    console.error('trial request failed', {
      message: error instanceof Error ? error.name : 'unknown',
    });
    return fail(
      500,
      'The trial could not complete this request. Nothing was generated.',
      'trial_error',
      cors
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};

export { handleRequest };
export type { D1Database, Env };
