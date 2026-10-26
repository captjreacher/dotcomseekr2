// Provider adapter for guided-discovery variation generation.
//
// The wizard only knows the request/response shape. This module owns the model
// call, so a future provider (or per-user key) can be added without changing the
// journey. The trial has exactly one adapter: Cloudflare Workers AI. There is no
// automatic fallback to OpenAI or any other paid provider; an unavailable model
// is reported to the user as a failure.
import { VARIATION_JSON_SCHEMA } from '../../../apps/web/src/lib/discovery/prompt.ts';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, configuredModel, configuredProvider } from './pricing.ts';
import type { AiBinding, Env } from './types.ts';

export interface ModelPrompt {
  system: string;
  user: string;
  schema: unknown;
}

export interface ModelOutput {
  parsed: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  billedUnits: number | null;
  billedUnitName: string | null;
}

export interface VariationModel {
  readonly provider: string;
  readonly model: string;
  generate(prompt: ModelPrompt, options: { signal: AbortSignal }): Promise<ModelOutput>;
}

export type ProviderErrorCode =
  | 'ai_unconfigured'
  | 'ai_quota'
  | 'ai_capacity'
  | 'ai_rate_limit'
  | 'ai_timeout'
  | 'ai_unreachable'
  | 'ai_model_unavailable'
  | 'ai_invalid_output'
  | 'ai_error';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly providerStatus: number | null;

  constructor(
    code: ProviderErrorCode,
    message: string,
    httpStatus: number,
    retryable: boolean,
    providerStatus: number | null = null
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.providerStatus = providerStatus;
  }
}

const MODEL_TIMEOUT_MS = 25_000;
const MAX_OUTPUT_TOKENS = 700;

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function readUsage(result: Record<string, unknown>): Pick<
  ModelOutput,
  'inputTokens' | 'outputTokens' | 'totalTokens' | 'billedUnits' | 'billedUnitName'
> {
  const usage =
    result.usage && typeof result.usage === 'object'
      ? (result.usage as Record<string, unknown>)
      : {};

  const inputTokens = numberOrNull(usage.prompt_tokens ?? usage.input_tokens);
  const outputTokens = numberOrNull(usage.completion_tokens ?? usage.output_tokens);
  const totalTokens =
    numberOrNull(usage.total_tokens) ??
    (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);

  // Cloudflare bills in Neurons. Only record the unit when the response supplies
  // it; otherwise the billed-unit fields stay unknown (null).
  const neurons = numberOrNull(usage.neurons ?? result.neurons);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    billedUnits: neurons,
    billedUnitName: neurons === null ? null : 'neurons',
  };
}

function readGeneratedJson(result: unknown): unknown {
  if (typeof result === 'string') return parseJson(result);

  if (!result || typeof result !== 'object') {
    throw new ProviderError(
      'ai_invalid_output',
      'The AI answer was not in the expected JSON shape.',
      502,
      false
    );
  }

  const record = result as Record<string, unknown>;
  const response = record.response ?? (Array.isArray(record.variations) ? record : null);

  if (typeof response === 'string') return parseJson(response);
  if (response && typeof response === 'object') return response;

  throw new ProviderError(
    'ai_invalid_output',
    'The AI answer was not in the expected JSON shape.',
    502,
    false
  );
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new ProviderError(
      'ai_invalid_output',
      'The AI answer was not valid JSON.',
      502,
      false
    );
  }
}

function providerStatusOf(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;

  const record = error as { status?: unknown; statusCode?: unknown };
  return numberOrNull(record.status ?? record.statusCode);
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;

  const record: Record<string, unknown> =
    error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const message =
    typeof record.message === 'string'
      ? record.message
      : error instanceof Error
        ? error.message
        : String(error);
  const name = typeof record.name === 'string' ? record.name : '';
  const numericCode = numberOrNull(record.code);
  const providerStatus = providerStatusOf(error);

  if (/abort|timed? ?out/i.test(`${name} ${message}`)) {
    return new ProviderError(
      'ai_timeout',
      'The AI provider took too long to answer. Try again.',
      504,
      true,
      providerStatus
    );
  }

  if (/json mode/i.test(message)) {
    return new ProviderError(
      'ai_invalid_output',
      'The AI provider could not satisfy the structured response. Try again.',
      502,
      false,
      providerStatus
    );
  }

  if (numericCode === 3036) {
    return new ProviderError(
      'ai_quota',
      'The Cloudflare Workers AI account has used its free daily allocation, so no suggestions were generated.',
      503,
      false,
      providerStatus
    );
  }

  if (numericCode === 3040) {
    return new ProviderError(
      'ai_capacity',
      'The AI model is temporarily out of capacity. Try again shortly.',
      503,
      true,
      providerStatus
    );
  }

  if (numericCode === 5007) {
    return new ProviderError(
      'ai_model_unavailable',
      'The configured Cloudflare Workers AI model is not available to this account.',
      503,
      false,
      providerStatus
    );
  }

  if (providerStatus === 429) {
    return new ProviderError(
      'ai_rate_limit',
      'The AI provider is rate limiting requests. Try again shortly.',
      503,
      true,
      providerStatus
    );
  }

  return new ProviderError(
    'ai_error',
    'The AI provider could not complete this request. Try again.',
    502,
    true,
    providerStatus
  );
}

class WorkersAiModel implements VariationModel {
  readonly provider = DEFAULT_PROVIDER;
  readonly model: string;
  private readonly ai: AiBinding;

  constructor(ai: AiBinding, model: string) {
    this.ai = ai;
    this.model = model;
  }

  async generate(prompt: ModelPrompt, options: { signal: AbortSignal }): Promise<ModelOutput> {
    let result: unknown;
    try {
      result = await this.ai.run(
        this.model,
        {
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: prompt.schema ?? VARIATION_JSON_SCHEMA,
          },
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature: 0.7,
        },
        { signal: options.signal }
      );
    } catch (error) {
      throw toProviderError(error);
    }

    const record =
      result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
    const usage = readUsage(record);

    return {
      parsed: readGeneratedJson(result),
      ...usage,
    };
  }
}

/**
 * Build the configured adapter. Unsupported providers fail closed rather than
 * falling back to the existing OpenAI integration.
 */
export function createModel(env: Env): VariationModel {
  const provider = configuredProvider(env);

  if (provider !== DEFAULT_PROVIDER) {
    throw new ProviderError(
      'ai_unconfigured',
      `The trial is configured for an unsupported provider (${provider}).`,
      503,
      false
    );
  }

  if (!env.AI) {
    throw new ProviderError(
      'ai_unconfigured',
      'The Cloudflare Workers AI binding is not configured for this trial.',
      503,
      false
    );
  }

  return new WorkersAiModel(env.AI, configuredModel(env) || DEFAULT_MODEL);
}

export { MODEL_TIMEOUT_MS };
