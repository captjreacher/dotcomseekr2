// Guided discovery endpoint for DotcomSeekr.
//
// Two actions, both explicit and provider-credential-free on the client:
//   check      - availability for exactly the domains the user asked about
//   variations - bounded, single-technique name variations from the AI model
//
// No deterministic fallback generator is wired in: if the model is unavailable
// the endpoint reports that, because a different generator would silently change
// what the user asked for.
import { json, parseTlds } from '../_shared/http.ts';
import {
  TECHNIQUES,
  buildVariationPrompt,
  joinLabel,
  sanitizeVariations,
  techniqueAvailable,
} from '../_shared/discovery.ts';
import { createPreferredProvider, type AvailabilityResult } from '../_shared/registrar.ts';
import type { CheckStatus, Technique } from '../_shared/discovery.ts';

const openAiUrl = 'https://api.openai.com/v1/chat/completions';
const defaultModel = 'gpt-4o-mini';
const modelTimeoutMs = 25_000;

type CheckPayload = {
  domain: string;
  status: CheckStatus;
  verified: boolean;
  price: number | null;
  currency: string;
  checkedAt: string | null;
  registrationUrl: string | null;
  reason?: string;
};

function statusFor(result: AvailabilityResult): CheckStatus {
  if (!result.verified) return 'unknown';
  if (!result.available) return 'taken';

  return result.metadata?.premium === true ? 'premium' : 'available';
}

function toCheckPayload(result: AvailabilityResult): CheckPayload {
  const status = statusFor(result);

  return {
    domain: result.domain,
    status,
    verified: result.verified === true,
    price: status === 'available' || status === 'premium' ? result.price : null,
    currency: result.currency || 'USD',
    checkedAt: result.checkedAt ?? null,
    registrationUrl:
      status === 'available' || status === 'premium' ? result.registrationUrl || null : null,
    reason:
      status === 'unknown'
        ? result.fallbackReason || 'No registrar answered for this name.'
        : undefined,
  };
}

function readTechnique(value: unknown): Technique | null {
  return typeof value === 'string' && (TECHNIQUES as readonly string[]).includes(value)
    ? (value as Technique)
    : null;
}

function text(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

async function readProviderError(response: Response): Promise<{ code?: string; type?: string }> {
  try {
    const payload = (await response.json()) as {
      error?: { code?: unknown; type?: unknown };
    };
    const code = typeof payload.error?.code === 'string' ? payload.error.code : undefined;
    const type = typeof payload.error?.type === 'string' ? payload.error.type : undefined;
    return { code, type };
  } catch {
    return {};
  }
}

async function generateVariations(req: Request, body: Record<string, unknown>): Promise<Response> {
  const technique = readTechnique(body.technique);
  if (!technique) return json(req, { error: 'Choose an exploration technique.' }, 400);

  const mode = body.mode === 'phrase' ? 'phrase' : 'word';
  const original = text(body.original, 80);
  const workingName = text(body.workingName, 80) || original;

  if (!joinLabel(workingName))
    return json(req, { error: 'A valid working name is required.' }, 400);

  if (!techniqueAvailable(technique, mode)) {
    return json(
      req,
      {
        error: 'Hyphens need a multi-word name. A single word has no word boundary to hyphenate.',
        code: 'technique_unavailable',
      },
      400
    );
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return json(
      req,
      {
        error: 'AI variation generation is not configured on the server.',
        code: 'ai_unconfigured',
      },
      503
    );
  }

  const model = Deno.env.get('DISCOVERY_MODEL') || defaultModel;
  const { system, user } = buildVariationPrompt(body, technique);

  let response: Response;
  try {
    response = await fetch(openAiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(modelTimeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && /abort|time/i.test(error.name + error.message);
    return json(
      req,
      {
        error: timedOut
          ? 'The AI provider took too long to answer. Try again.'
          : 'The AI provider could not be reached.',
        code: timedOut ? 'ai_timeout' : 'ai_unreachable',
      },
      timedOut ? 504 : 502
    );
  }

  if (!response.ok) {
    // Read only the provider's error type/code. The message can contain request
    // details, so it stays out of the response; no credential is ever echoed.
    const providerError = await readProviderError(response);
    const quotaCodes = new Set([
      'insufficient_quota',
      'credit_balance_exhausted',
      'billing_hard_limit_reached',
    ]);
    const quota = Boolean(providerError.code && quotaCodes.has(providerError.code));
    const code =
      response.status === 401 || response.status === 403
        ? 'ai_auth'
        : quota
          ? 'ai_quota'
          : response.status === 429
            ? 'ai_rate_limit'
            : 'ai_error';
    const error =
      code === 'ai_auth'
        ? 'The AI provider rejected the configured credentials.'
        : code === 'ai_quota'
          ? 'The AI provider account has no remaining credit, so no suggestions were generated.'
          : code === 'ai_rate_limit'
            ? 'The AI provider is rate limiting requests. Try again shortly.'
            : `The AI provider returned HTTP ${response.status}.`;

    return json(
      req,
      {
        error,
        code,
        providerStatus: response.status,
        providerCode: providerError.code ?? providerError.type ?? null,
      },
      503
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = payload.choices?.[0]?.message?.content;

  let parsed: unknown = null;
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : null;
  } catch {
    parsed = null;
  }

  const { variations, rejected } = sanitizeVariations(parsed, {
    technique,
    mode,
    workingName,
    original,
    meaning: text(body.meaning, 400),
    commentary: text(body.commentary, 400),
    previous: Array.isArray(body.previous)
      ? body.previous.filter((value): value is string => typeof value === 'string')
      : [],
  });

  if (variations.length === 0) {
    return json(
      req,
      {
        error: 'The AI answer contained no usable suggestions for this technique.',
        code: 'ai_invalid_output',
        rejected,
        technique,
      },
      502
    );
  }

  return json(req, {
    technique,
    mode,
    workingName,
    variations,
    rejected,
    model,
    generatedAt: new Date().toISOString(),
  });
}

// Wiktionary's REST API is used because it is an identifiable, stable source that
// returns a documented definition shape. The older Free Dictionary API answers
// with HTTP 530 from this network, so it cannot be relied on.
const dictionaryEndpoint = 'https://en.wiktionary.org/api/rest_v1/page/definition/';
const dictionaryTimeoutMs = 8_000;
const dictionarySource = {
  name: 'Wiktionary',
  url: 'https://en.wiktionary.org/',
  detail: 'Wikimedia Foundation definitions (CC BY-SA)',
};

/**
 * Dictionary lookup, proxied server-side.
 *
 * The public dictionary does not send CORS headers, so the browser cannot call
 * it directly. The response carries the definition source so the UI can show it.
 */
async function lookupDefinitions(req: Request, body: Record<string, unknown>): Promise<Response> {
  const term = text(body.term, 80);
  if (!term) return json(req, { error: 'Enter a word or phrase to look up.' }, 400);

  let response: Response;
  try {
    response = await fetch(`${dictionaryEndpoint}${encodeURIComponent(term)}`, {
      headers: {
        Accept: 'application/json',
        // Wikimedia asks clients to identify themselves.
        'User-Agent': 'DotcomSeekr/0.1 (https://dotcomseekr.com)',
      },
      signal: AbortSignal.timeout(dictionaryTimeoutMs),
    });
  } catch {
    return json(
      req,
      {
        term,
        senses: [],
        source: null,
        noEntry: true,
        error: 'The dictionary could not be reached. You can describe the meaning yourself.',
      },
      200
    );
  }

  if (response.status === 404) {
    return json(req, { term, senses: [], source: null, noEntry: true }, 200);
  }

  if (!response.ok) {
    return json(
      req,
      {
        term,
        senses: [],
        source: null,
        noEntry: true,
        error: `The dictionary returned HTTP ${response.status}. You can describe the meaning yourself.`,
      },
      200
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const senses = readDictionarySenses(payload);
  if (senses.length === 0) return json(req, { term, senses: [], source: null, noEntry: true }, 200);

  return json(req, { term, senses, source: dictionarySource, noEntry: false }, 200);
}
function readDictionarySenses(
  payload: unknown
): Array<{ partOfSpeech: string; definition: string }> {
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  const english = Array.isArray(record.en) ? record.en : [];
  const entries = english.length > 0 ? english : Object.values(record).flat();
  const senses: Array<{ partOfSpeech: string; definition: string }> = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;

    const partOfSpeech = text((entry as { partOfSpeech?: unknown }).partOfSpeech, 40);
    const definitions = (entry as { definitions?: unknown }).definitions;
    if (!Array.isArray(definitions)) continue;

    for (const definition of definitions) {
      const value = plainText(
        typeof (definition as { definition?: unknown }).definition === 'string'
          ? ((definition as { definition: string }).definition as string)
          : ''
      ).slice(0, 280);
      if (!value) continue;

      const key = value.toLowerCase();
      if (seen.has(key)) continue;

      seen.add(key);
      senses.push({ partOfSpeech: partOfSpeech.toLowerCase(), definition: value });
      if (senses.length >= 8) return senses;
    }
  }

  return senses;
}

/** Wiktionary returns HTML fragments inside definitions. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function checkDomains(req: Request, body: Record<string, unknown>): Promise<Response> {
  const requested = Array.isArray(body.domains)
    ? body.domains.filter((value): value is string => typeof value === 'string')
    : [];
  const selectedTlds = parseTlds(body.extensions ?? body.tlds);

  // Only names the user is looking at are accepted, and only extensions they
  // selected: nothing is generated or added here.
  const domains: string[] = [];
  for (const candidate of requested) {
    const value = candidate.trim().toLowerCase();
    const label = value.split('.')[0] ?? '';
    const extension = value.split('.').slice(1).join('.');

    if (!label || !extension) continue;
    if (selectedTlds.length > 0 && !selectedTlds.includes(extension)) continue;
    if (domains.includes(value)) continue;
    if (domains.length >= 15) break;

    domains.push(value);
  }

  if (domains.length === 0) {
    return json(req, { error: 'No checkable domains were supplied.' }, 400);
  }

  const provider = createPreferredProvider();
  const results = await provider.checkDomains(domains);
  const answers = results.map(toCheckPayload);

  const verified = answers.filter((answer) => answer.verified);
  const firstVerified = results.find((result) => result.verified);

  return json(req, {
    results: answers,
    diagnostics: {
      provider: firstVerified?.provider ?? provider.provider,
      mode: firstVerified?.mode ?? provider.mode,
      checkedAt: results[0]?.checkedAt ?? new Date().toISOString(),
      verifiedCount: verified.length,
      requestedCount: domains.length,
      fallbackReason: results.find((result) => result.fallbackReason)?.fallbackReason,
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(req, { ok: true });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? '').trim();

    if (action === 'check') return await checkDomains(req, body);
    if (action === 'variations') return await generateVariations(req, body);
    if (action === 'definitions') return await lookupDefinitions(req, body);

    return json(req, { error: 'Unknown action.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return json(req, { error: message }, 500);
  }
});
