import {
  CREATIVE_KINDS,
  CREATIVE_KIND_LABELS,
  ExplorationMode,
  type CreativeRequest,
} from './types.ts';

/**
 * Creative naming prompt.
 *
 * The model is a *creative discovery* assistant. It is explicitly told not to
 * judge availability, not to invent registrar data, and to return structured
 * JSON. All authority (dedupe, validation, scoring) stays deterministic.
 */
export const CREATIVE_SYSTEM_PROMPT = `You are a creative naming partner helping generate brandable domain-name ideas.

Your job is CREATIVE DISCOVERY, not availability checking and not authoritative scoring.
Explore the naming problem from several distinct creative directions in a single response.

CRITICAL RULES:
1. Respond ONLY with valid JSON matching this exact schema:
   {
     "candidates": [
       { "value": "word", "kind": "semantic", "confidence": 0.8, "rationale": "brief reason" }
     ]
   }
2. Do NOT claim, imply, or guess whether any domain is available, taken, or premium.
3. Do NOT fabricate registrar information, prices, or availability.
4. Do NOT propose obvious trademarks, famous brand names, or protected terms.
5. "confidence" is your own subjective 0.0-1.0 fit estimate. It is only a small
   nudge downstream — it is NOT a promise and is NOT used as the final score.
6. "value" must be a concise, lowercase, alphanumeric idea suitable for a domain
   label (no spaces, no hyphens, no dots, no digits-only). Prefer 3-20 characters.
7. Each "kind" must be exactly one of: ${CREATIVE_KINDS.join(', ')}.
8. Provide 1-2 short rationales per idea; keep every rationale under ~20 words.

CREATIVE DIRECTIONS to explore deliberately (mix several, do not return synonyms only):
- semantic: a fresh but related idea
- metaphor: an evocative image or figure of speech
- category_adjacent: a term borrowed from a neighbouring field or hobby
- portmanteau: two ideas blended into one pronounceable word
- compressed: a longer phrase squeezed into a short label
- phonetic: sound-driven wordplay
- invented: a new but pronounceable non-word
- action: something the user does with the product
- outcome: the benefit or result the user gets
- brandable: unexpected but explainable, memorable

Return ONLY the JSON object. No prose, no markdown fences.`;

const KIND_GUIDANCE: Record<string, string> = {
  SAFE: 'Stay close to the seed. Prefer familiar, explainable ideas; avoid abstraction.',
  EXPLORATORY:
    'Balance familiarity with creativity. Mix conventional terms with metaphor and adjacent concepts.',
  ADVENTUROUS:
    'Push the creative boundaries. Favour portmanteaus, invented words and unexpected connections — always pronounceable and explainable.',
};

function explorationGuidance(mode?: ExplorationMode): string {
  if (!mode) return KIND_GUIDANCE.EXPLORATORY;
  return KIND_GUIDANCE[mode] ?? KIND_GUIDANCE.EXPLORATORY;
}

function toneGuidance(tone?: string): string {
  if (!tone) return 'Tone: balanced and brandable.';
  const normalized = tone.trim().toUpperCase();
  switch (normalized) {
    case 'TECHNICAL':
      return 'Tone: TECHNICAL — precise, engineering-flavoured vocabulary.';
    case 'BRANDABLE':
      return 'Tone: BRANDABLE — catchy, memorable, emotionally evocative.';
    case 'PLAYFUL':
      return 'Tone: PLAYFUL — energetic, friendly, approachable.';
    case 'PROFESSIONAL':
      return 'Tone: PROFESSIONAL — authoritative, credible, businesslike.';
    case 'MODERN':
      return 'Tone: MODERN — contemporary, tech-forward, innovative.';
    default:
      return `Tone: ${tone}.`;
  }
}

function contextBlock(request: CreativeRequest): string {
  const context = request.deterministicContext;
  if (!context) return '';
  const lines: string[] = [];
  if (context.rootTokens?.length) {
    lines.push(`Deterministic root tokens: ${context.rootTokens.join(', ')}`);
  }
  if (context.topLabels?.length) {
    lines.push(
      `Already-generated labels (do not repeat these): ${context.topLabels.join(', ')}`
    );
  }
  if (lines.length === 0) return '';
  return `\n${lines.join('\n')}`;
}

/** Build the single user prompt for a search-level creative request. */
export function buildCreativeUserPrompt(request: CreativeRequest): string {
  const maxCandidates = request.maxCandidates ?? 40;

  return `Seed: "${request.seed}"${request.useCase ? `\nUse case / description: "${request.useCase}"` : ''}

${explorationGuidance(request.explorationMode)}
${toneGuidance(request.tone)}

Kinds: ${CREATIVE_KINDS.map((kind) => `${kind} (${CREATIVE_KIND_LABELS[kind]})`).join(', ')}.${contextBlock(request)}

Return up to ${maxCandidates} candidates as a single JSON object matching the schema.
Explore multiple creative directions; do not simply return synonyms of the seed.`;
}
