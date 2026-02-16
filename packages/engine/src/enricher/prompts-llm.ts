import { ExplorationMode, ToneModifier } from './schemas';

/**
 * System prompt that enforces JSON-only output
 */
export const SYSTEM_PROMPT = `You are a domain name token generator. You MUST respond ONLY with valid JSON.

Your task is to generate creative word tokens that could be used in domain names.
You will be given a seed token and context, and you must generate related tokens.

CRITICAL RULES:
1. Output ONLY valid JSON matching this exact schema:
   {
     "tokens": ["word1", "word2", "word3"],
     "confidence": 0.85,
     "reasoning": "brief explanation"
   }

2. Generate ONLY individual word tokens, NEVER complete domain names
3. All tokens must be:
   - Single words (no spaces, no hyphens in the token itself)
   - 2-20 characters long
   - Lowercase
   - Alphanumeric only
   - Suitable for domain names

4. Generate 5-20 tokens per request
5. Confidence score should reflect how well tokens fit the context (0.0-1.0)
6. DO NOT generate:
   - Complete domain names
   - Multi-word phrases
   - Trademarked terms
   - Generic stopwords (the, and, or, etc.)
   - Numbers-only tokens

Example valid response:
{
  "tokens": ["pulse", "nexus", "vertex", "quantum", "flux"],
  "confidence": 0.88,
  "reasoning": "Technical, modern terms related to data flow"
}`;

/**
 * Generate user prompt based on token, mode, and tone
 */
export function generateUserPrompt(
  seedToken: string,
  originalPhrase: string,
  mode: ExplorationMode,
  tone: ToneModifier
): string {
  const modeInstructions = getModeInstructions(mode);
  const toneInstructions = getToneInstructions(tone);

  return `Seed token: "${seedToken}"
Original phrase: "${originalPhrase}"

${modeInstructions}

${toneInstructions}

Generate creative word tokens that:
1. Are semantically related to the seed token
2. Match the specified tone and exploration mode
3. Could be combined to form brandable domain names
4. Are memorable and pronounceable

Remember: Generate ONLY individual word tokens, not complete domain names.
Respond with valid JSON only.`;
}

/**
 * Get mode-specific instructions
 */
function getModeInstructions(mode: ExplorationMode): string {
  switch (mode) {
    case ExplorationMode.SAFE:
      return `Mode: SAFE
- Stay close to the seed token's semantic field
- Use conventional, widely-understood words
- Avoid abstract or invented terms
- Focus on clarity over creativity`;

    case ExplorationMode.EXPLORATORY:
      return `Mode: EXPLORATORY
- Balance familiarity with creativity
- Include some metaphorical or adjacent concepts
- Mix conventional and modern terms
- Explore related semantic domains`;

    case ExplorationMode.ADVENTUROUS:
      return `Mode: ADVENTUROUS
- Push creative boundaries
- Include invented/portmanteau words (if pronounceable)
- Explore distant semantic connections
- Prioritize uniqueness and memorability
- Take risks with unexpected combinations`;

    default:
      return '';
  }
}

/**
 * Get tone-specific instructions
 */
function getToneInstructions(tone: ToneModifier): string {
  switch (tone) {
    case ToneModifier.TECHNICAL:
      return `Tone: TECHNICAL
- Use precise, technical terminology
- Include industry-standard terms
- Focus on functionality and features
- Examples: protocol, algorithm, framework, infrastructure`;

    case ToneModifier.BRANDABLE:
      return `Tone: BRANDABLE
- Prioritize memorability and uniqueness
- Use evocative, emotional words
- Include metaphors and imagery
- Examples: spark, nexus, zenith, catalyst`;

    case ToneModifier.PLAYFUL:
      return `Tone: PLAYFUL
- Use fun, energetic words
- Include casual, friendly terms
- Focus on approachability
- Examples: bounce, fizz, zap, spark`;

    case ToneModifier.PROFESSIONAL:
      return `Tone: PROFESSIONAL
- Use authoritative, business-appropriate terms
- Include formal, established words
- Focus on credibility and trust
- Examples: prime, apex, summit, global`;

    case ToneModifier.MODERN:
      return `Tone: MODERN
- Use contemporary, trendy terms
- Include tech-forward vocabulary
- Focus on innovation and future
- Examples: quantum, neural, fusion, vertex`;

    default:
      return '';
  }
}
