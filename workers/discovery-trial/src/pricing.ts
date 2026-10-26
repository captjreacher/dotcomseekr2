// Official Cloudflare Workers AI pricing for the one model this trial uses.
//
// Source, retrieved 2026-10-26:
// https://developers.cloudflare.com/workers-ai/platform/pricing/
// The pricing page lists both token prices and the equivalent Neuron rates.
// We store both so a cost estimate never has to invent a Neuron conversion.
import type { Env } from './types.ts';

export const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const DEFAULT_PROVIDER = 'workers-ai';

export const PRICING_SOURCE = 'https://developers.cloudflare.com/workers-ai/platform/pricing/';
export const PRICING_DATE = '2026-10-26';

export interface ModelPricing {
  model: string;
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  inputNeuronsPerMillionTokens: number;
  outputNeuronsPerMillionTokens: number;
}

const PRICING: Record<string, ModelPricing> = {
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': {
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    inputUsdPerMillionTokens: 0.293,
    outputUsdPerMillionTokens: 2.253,
    inputNeuronsPerMillionTokens: 26668,
    outputNeuronsPerMillionTokens: 204805,
  },
};

export function pricingFor(model: string): ModelPricing | null {
  return PRICING[model] ?? null;
}

export interface UsageEstimate {
  estimatedCostUsd: number | null;
  estimatedNeurons: number | null;
}

/**
 * Estimate cost and Neurons from tokens the provider actually reported.
 * When either side is missing the estimate is `null`: an unknown measurement is
 * recorded as unknown rather than silently treated as zero.
 */
export function estimateUsage(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null
): UsageEstimate {
  const pricing = pricingFor(model);
  if (!pricing || inputTokens === null || outputTokens === null) {
    return { estimatedCostUsd: null, estimatedNeurons: null };
  }

  const inputM = inputTokens / 1_000_000;
  const outputM = outputTokens / 1_000_000;

  return {
    estimatedCostUsd:
      inputM * pricing.inputUsdPerMillionTokens + outputM * pricing.outputUsdPerMillionTokens,
    estimatedNeurons:
      inputM * pricing.inputNeuronsPerMillionTokens + outputM * pricing.outputNeuronsPerMillionTokens,
  };
}

export function configuredModel(env: Env): string {
  return env.TRIAL_MODEL?.trim() || DEFAULT_MODEL;
}

export function configuredProvider(env: Env): string {
  return env.TRIAL_PROVIDER?.trim() || DEFAULT_PROVIDER;
}
