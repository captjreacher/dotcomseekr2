import { z } from 'zod';

/**
 * Strict JSON schema for LLM enrichment response
 */
export const EnrichmentResponseSchema = z.object({
  tokens: z.array(z.string().min(1).max(20)).min(1).max(50),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

export type EnrichmentResponse = z.infer<typeof EnrichmentResponseSchema>;

/**
 * Exploration modes for LLM enrichment
 */
export enum ExplorationMode {
  SAFE = 'SAFE',
  EXPLORATORY = 'EXPLORATORY',
  ADVENTUROUS = 'ADVENTUROUS',
}

/**
 * Tone modifiers for enrichment
 */
export enum ToneModifier {
  TECHNICAL = 'TECHNICAL',
  BRANDABLE = 'BRANDABLE',
  PLAYFUL = 'PLAYFUL',
  PROFESSIONAL = 'PROFESSIONAL',
  MODERN = 'MODERN',
}

/**
 * LLM enrichment options
 */
export interface LLMEnrichmentOptions {
  mode: ExplorationMode;
  tone: ToneModifier;
  maxTokens: number;
  timeoutMs: number;
  topN: number;
}

/**
 * Default LLM enrichment options
 */
export const DEFAULT_LLM_OPTIONS: LLMEnrichmentOptions = {
  mode: ExplorationMode.EXPLORATORY,
  tone: ToneModifier.BRANDABLE,
  maxTokens: 1000,
  timeoutMs: 10000,
  topN: 10,
};
