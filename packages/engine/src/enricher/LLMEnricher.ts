import Anthropic from '@anthropic-ai/sdk';
import { IEnricher, EnrichmentResult } from './IEnricher';
import {
  EnrichmentResponseSchema,
  EnrichmentResponse,
  ExplorationMode,
  ToneModifier,
  LLMEnrichmentOptions,
  DEFAULT_LLM_OPTIONS,
} from './schemas';
import { SYSTEM_PROMPT, generateUserPrompt } from './prompts-llm';

/**
 * Cache key generator
 */
function getCacheKey(token: string, tone: ToneModifier): string {
  return `${token}:${tone}`;
}

/**
 * LLM-based semantic enrichment using Claude API
 */
export class LLMEnricher implements IEnricher {
  private client: Anthropic;
  private cache: Map<string, EnrichmentResponse> = new Map();

  constructor(private apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Enrich a single token with LLM-generated alternatives
   */
  async enrichToken(
    token: string,
    originalPhrase: string,
    options: Partial<LLMEnrichmentOptions> = {}
  ): Promise<EnrichmentResponse> {
    const opts = { ...DEFAULT_LLM_OPTIONS, ...options };
    const cacheKey = getCacheKey(token, opts.tone);

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      // Call Claude with timeout
      const response = await this.callClaudeWithTimeout(
        token,
        originalPhrase,
        opts
      );

      // Cache successful response
      this.cache.set(cacheKey, response);

      return response;
    } catch (error: any) {
      console.error(`LLM enrichment failed for token "${token}":`, error.message);

      // Return empty result on failure (fail-safe)
      return {
        tokens: [],
        confidence: 0,
        reasoning: `Error: ${error.message}`,
      };
    }
  }

  /**
   * Call Claude API with timeout
   */
  private async callClaudeWithTimeout(
    token: string,
    originalPhrase: string,
    options: LLMEnrichmentOptions
  ): Promise<EnrichmentResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const userPrompt = generateUserPrompt(
        token,
        originalPhrase,
        options.mode,
        options.tone
      );

      const message = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: options.maxTokens,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      clearTimeout(timeoutId);

      // Extract and parse JSON response
      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const jsonText = this.extractJSON(content.text);
      const parsed = JSON.parse(jsonText);

      // Validate with Zod
      const validated = EnrichmentResponseSchema.parse(parsed);

      return validated;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`LLM request timed out after ${options.timeoutMs}ms`);
      }

      throw error;
    }
  }

  /**
   * Extract JSON from response text (handles cases where LLM adds extra text)
   */
  private extractJSON(text: string): string {
    // Try to find JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }

    // If no JSON found, return original text and let JSON.parse fail
    return text;
  }

  /**
   * Legacy enrich method for IEnricher interface
   */
  async enrich(words: string[], context: string): Promise<EnrichmentResult> {
    const alternatives = new Map<string, string[]>();
    const semanticCategories = new Map<string, string>();
    const weights = new Map<string, number>();

    // Enrich each word
    for (const word of words.slice(0, 10)) {
      // Limit to 10 words
      try {
        const result = await this.enrichToken(word, context);

        if (result.tokens.length > 0) {
          alternatives.set(word, result.tokens);
          semanticCategories.set(word, result.reasoning || 'enriched');
          weights.set(word, result.confidence);
        }
      } catch (error) {
        // Skip failed enrichments
        console.error(`Failed to enrich word "${word}":`, error);
      }
    }

    return {
      alternatives,
      semanticCategories,
      weights,
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

