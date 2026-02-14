/**
 * LLM prompt templates for domain name generation
 */

export const ENRICHMENT_SYSTEM_PROMPT = `You are a domain name expert helping to generate creative, brandable domain names.
Your task is to suggest semantically related words and alternatives that would make great domain names.`;

export function createEnrichmentPrompt(words: string[], context: string): string {
  return `
Given these seed words: ${words.join(', ')}
Context: ${context}

Please suggest:
1. Synonyms and related terms
2. Creative alternatives
3. Industry-specific variations

Return the results as a JSON object.
  `.trim();
}
