import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  GENERATION_STRATEGIES,
  generateDomainCandidates,
  type GenerationCandidate,
  type GenerationStrategy,
} from '../_shared/generation.ts';

const allowedOrigins = new Set([
  'http://localhost:5173',
  'https://dotcomseekr.staging.maximisedai.com',
]);
const defaultTlds = ['com', 'ai', 'io', 'co'];
const allowedTlds = new Set(['com', 'ai', 'io', 'co', 'net', 'org']);
const maxDomainsPerSearch = 36;
// Dynadot's standard tier accepts a single domain per command and allows one
// in-flight request per account, so a search is checked domain by domain. Each
// command is bounded individually and the loop stops before it can outlive the
// client's 75s deadline.
const dynadotRequestTimeoutMs = 12_000;
const dynadotSearchBudgetMs = 60_000;
// Dynadot documents 60 requests/minute for standard accounts. Pacing from the
// start of one request to the start of the next keeps a whole search inside
// that budget (~57/minute) even when the registrar answers quickly.
const dynadotRequestIntervalMs = 1_050;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type ProviderMode = 'sandbox' | 'live' | 'mock';
type ProviderName = 'mock' | 'namecheap' | 'dynadot';

type AvailabilityResult = {
  domain: string;
  available: boolean;
  price: number | null;
  currency: string;
  provider: ProviderName;
  mode: ProviderMode;
  checkedAt: string;
  registrationUrl: string;
  fallbackReason?: string;
  /** True only when a live registrar actually answered for this domain. */
  verified?: boolean;
  metadata: Record<string, unknown>;
};

type RegistrarProvider = {
  provider: ProviderName;
  mode: ProviderMode;
  fallbackReason?: string;
  checkDomains(domains: string[]): Promise<AvailabilityResult[]>;
};

type DynadotSearchResult = {
  DomainName?: unknown;
  Available?: unknown;
  Price?: unknown;
};

type DynadotSearchResponse = {
  SearchResponse?: {
    ResponseCode?: unknown;
    SearchResults?: unknown;
    Error?: unknown;
    ErrorMessage?: unknown;
    Message?: unknown;
  };
};

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';

  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
}

function json(req: Request, body: Record<string, unknown> | unknown[], status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

function getServiceKey() {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeys) return JSON.parse(secretKeys).default as string | undefined;
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? undefined;
}

function getClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = getServiceKey();

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service credentials are not configured');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseTlds(rawTlds: unknown) {
  const requested = Array.isArray(rawTlds)
    ? rawTlds
    : typeof rawTlds === 'string'
      ? rawTlds.split(',')
      : [];

  const clean = requested
    .map((value) => String(value).toLowerCase().replace(/^\./, '').trim())
    .filter((value) => allowedTlds.has(value));

  return [...new Set(clean)].slice(0, 6);
}

function hash(value: string) {
  let total = 0;
  for (let i = 0; i < value.length; i++) {
    total = (total * 31 + value.charCodeAt(i)) >>> 0;
  }
  return total;
}

function buildNamecheapRegistrationUrl(pathDomain: string) {
  const url = new URL('https://www.namecheap.com/domains/registration/results/');
  url.searchParams.set('domain', pathDomain);

  const affiliateId = Deno.env.get('NAMECHEAP_AFFILIATE_ID');
  if (affiliateId) {
    url.searchParams.set('affId', affiliateId);
  }

  return url.toString();
}

function buildDynadotRegistrationUrl(pathDomain: string) {
  const url = new URL('https://www.dynadot.com/domain/search.html');
  url.searchParams.set('domain', pathDomain);
  return url.toString();
}

function fakeAvailability(domain: string, fallbackReason?: string): AvailabilityResult {
  const value = hash(domain);
  const available = value % 4 !== 0;
  const premium = available && value % 9 === 0;
  const checkedAt = new Date().toISOString();

  return {
    domain,
    available,
    price: available ? (premium ? 499 : domain.endsWith('.ai') ? 79 : 14) : null,
    currency: 'USD',
    provider: 'mock',
    mode: 'mock',
    checkedAt,
    registrationUrl: '',
    fallbackReason,
    metadata: {
      premium,
      deterministic: true,
      providerConfigured: false,
    },
  };
}

function createMockProvider(fallbackReason?: string): RegistrarProvider {
  return {
    provider: 'mock',
    mode: 'mock',
    fallbackReason,
    async checkDomains(domains) {
      return domains.map((domain) => fakeAvailability(domain, fallbackReason));
    },
  };
}

function readNamecheapConfig() {
  const config = {
    apiUser: Deno.env.get('NAMECHEAP_API_USER'),
    apiKey: Deno.env.get('NAMECHEAP_API_KEY'),
    username: Deno.env.get('NAMECHEAP_USERNAME'),
    clientIp: Deno.env.get('NAMECHEAP_CLIENT_IP'),
    sandboxRaw: Deno.env.get('NAMECHEAP_SANDBOX'),
  };

  const required: Array<[keyof typeof config, string]> = [
    ['apiUser', 'NAMECHEAP_API_USER'],
    ['apiKey', 'NAMECHEAP_API_KEY'],
    ['username', 'NAMECHEAP_USERNAME'],
    ['clientIp', 'NAMECHEAP_CLIENT_IP'],
    ['sandboxRaw', 'NAMECHEAP_SANDBOX'],
  ];
  const missing = required.filter(([key]) => !config[key]).map(([, envName]) => envName);
  const sandbox = config.sandboxRaw === 'true';

  if (config.sandboxRaw && !['true', 'false'].includes(config.sandboxRaw)) {
    missing.push('NAMECHEAP_SANDBOX must be true or false');
  }

  return { config: { ...config, sandbox }, missing };
}

function readDynadotConfig() {
  const config = {
    apiKey: Deno.env.get('DYNADOT_API_KEY'),
    sandboxRaw: Deno.env.get('DYNADOT_SANDBOX'),
  };

  return {
    config: { ...config, sandbox: config.sandboxRaw === 'true' },
    hasApiKey: Boolean(config.apiKey),
    configError:
      config.sandboxRaw && !['true', 'false'].includes(config.sandboxRaw)
        ? 'DYNADOT_SANDBOX must be true or false'
        : undefined,
  };
}

function namecheapIsConfigured() {
  return readNamecheapConfig().missing.length === 0;
}

function parseAttributes(xml: string) {
  const matches = [...xml.matchAll(/DomainCheckResult\b([^/>]*)\/?>/g)];

  return matches.map((match) => {
    const attrs: Record<string, string> = {};
    for (const attr of match[1].matchAll(/(\w+)="([^"]*)"/g)) {
      attrs[attr[1]] = attr[2];
    }
    return attrs;
  });
}

function parseNamecheapErrors(xml: string) {
  return [...xml.matchAll(/<Error[^>]*>([^<]+)<\/Error>/g)].map((match) => match[1]);
}

function normalizeDynadotFallbackReason(message: string, status?: number) {
  const normalized = message.toLowerCase();
  if (status === 401 || status === 403 || normalized.includes('api key')) {
    return 'Dynadot invalid API key or API access denied';
  }
  if (normalized.includes('too many domains')) {
    return 'Dynadot account is limited to one domain per command';
  }
  if (status === 429 || normalized.includes('rate') || normalized.includes('too many')) {
    return 'Dynadot rate limit reached';
  }
  if (status && status >= 500) return `Dynadot endpoint unavailable: HTTP ${status}`;
  if (message.includes('No Dynadot search results')) return 'Dynadot returned malformed JSON';
  if (/timed?\s*out|timeout|abort/i.test(message)) return 'Dynadot request timed out';
  return message;
}

async function checkFallbackProvider(
  fallbackProvider: RegistrarProvider,
  domains: string[],
  fallbackReason: string
) {
  const results = await fallbackProvider.checkDomains(domains);

  // The fallback provider's own reason describes why *it* was chosen, which
  // hides the actual registrar failure that caused this fallback. Report the
  // real reason and mark the result unverified, because a fallback result must
  // never be presented to users as a checked availability answer.
  return results.map((result) => ({
    ...result,
    fallbackReason,
    verified: false,
    metadata: {
      ...result.metadata,
      fallbackReason,
      verified: false,
    },
  }));
}

function parseDynadotPrice(rawPrice?: string) {
  if (!rawPrice) return { price: null, currency: 'USD', premium: false };

  const priceMatch = rawPrice.match(/(\d+(?:\.\d+)?)/);
  const currencyMatch = rawPrice.match(/\bin\s+([A-Z]{3})\b/);

  return {
    price: priceMatch ? Number(priceMatch[1]) : null,
    currency: currencyMatch?.[1] ?? 'USD',
    premium: /premium/i.test(rawPrice) && !/not premium/i.test(rawPrice),
  };
}

function dynadotResponseMessage(searchResponse: DynadotSearchResponse['SearchResponse']) {
  const candidates = [searchResponse?.Error, searchResponse?.ErrorMessage, searchResponse?.Message];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  return undefined;
}

function logDynadotFallback(reason: string, detail: Record<string, unknown>) {
  console.warn(
    'Dynadot availability fallback',
    JSON.stringify({
      reason,
      ...detail,
    })
  );
}

function dynadotSearchResults(value: unknown): DynadotSearchResult[] | null {
  if (!Array.isArray(value)) return null;

  return value.filter(
    (item): item is DynadotSearchResult => item !== null && typeof item === 'object'
  );
}

function buildDynadotSearchUrl(endpoint: string, apiKey: string, domains: string[]) {
  const params = new URLSearchParams();
  params.set('key', apiKey);
  params.set('command', 'search');
  domains.forEach((domain, index) => params.set(`domain${index}`, domain));
  params.set('show_price', '1');
  params.set('currency', 'USD');

  return `${endpoint}?${params.toString()}`;
}

/**
 * One availability check for a single domain.
 *
 * Dynadot's standard tier rejects a command carrying more than one domain
 * ("too many domains entered, please search one domain per command"), so every
 * check is issued as its own command.
 */
async function checkDynadotDomain(
  endpoint: string,
  apiKey: string,
  domain: string,
  mode: ProviderMode,
  timeoutMs: number
): Promise<{ ok: true; result: AvailabilityResult } | { ok: false; reason: string }> {
  try {
    const response = await fetch(buildDynadotSearchUrl(endpoint, apiKey, [domain]), {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const reason = normalizeDynadotFallbackReason(
        `Dynadot HTTP ${response.status}`,
        response.status
      );
      logDynadotFallback(reason, { mode, domain, status: response.status });
      return { ok: false, reason };
    }

    let payload: DynadotSearchResponse;
    try {
      payload = (await response.json()) as DynadotSearchResponse;
    } catch {
      const reason = 'Dynadot returned invalid JSON';
      logDynadotFallback(reason, { mode, domain });
      return { ok: false, reason };
    }

    const searchResponse = payload.SearchResponse;
    const responseCode =
      searchResponse?.ResponseCode !== undefined && searchResponse.ResponseCode !== null
        ? String(searchResponse.ResponseCode)
        : undefined;
    const responseMessage = dynadotResponseMessage(searchResponse);

    if (responseCode !== '0') {
      const reason = normalizeDynadotFallbackReason(
        responseMessage || `Dynadot returned ResponseCode ${responseCode ?? 'missing'}`,
        response.status
      );
      logDynadotFallback(reason, {
        mode,
        domain,
        responseCode: responseCode ?? null,
        responseMessage: responseMessage ?? null,
      });
      return { ok: false, reason };
    }

    const searchResults = dynadotSearchResults(searchResponse?.SearchResults);
    const result = searchResults?.find(
      (item) =>
        typeof item.DomainName === 'string' &&
        String(item.DomainName).toLowerCase() === domain.toLowerCase()
    );

    if (!result || typeof result.Available !== 'string') {
      const reason = 'Dynadot response omitted domain result';
      logDynadotFallback(reason, { mode, domain });
      return { ok: false, reason };
    }

    const domainName = String(result.DomainName);
    const availableRaw = result.Available.toLowerCase();
    const priceRaw = typeof result.Price === 'string' ? result.Price : undefined;
    const price = parseDynadotPrice(priceRaw);

    return {
      ok: true,
      result: {
        domain: domainName,
        available: availableRaw === 'yes',
        price: availableRaw === 'yes' ? price.price : null,
        currency: price.currency,
        provider: 'dynadot',
        mode,
        checkedAt: new Date().toISOString(),
        registrationUrl: buildDynadotRegistrationUrl(domainName),
        verified: true,
        metadata: {
          premium: price.premium,
          responseCode,
          priceText: priceRaw,
          verified: true,
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Dynadot request failed';
    const reason = normalizeDynadotFallbackReason(message);
    logDynadotFallback(reason, { mode, domain });
    return { ok: false, reason };
  }
}

function createDynadotProvider(fallbackProvider: RegistrarProvider): RegistrarProvider {
  const { config, hasApiKey, configError } = readDynadotConfig();

  if (!hasApiKey) {
    return fallbackProvider;
  }

  const mode: ProviderMode = config.sandbox ? 'sandbox' : 'live';
  const endpoint = config.sandbox
    ? 'https://api-sandbox.dynadot.com/api3.json'
    : 'https://api.dynadot.com/api3.json';

  return {
    provider: 'dynadot',
    mode,
    async checkDomains(domains) {
      if (configError) {
        logDynadotFallback(configError, { mode });
        return checkFallbackProvider(fallbackProvider, domains, configError);
      }

      const checked: AvailabilityResult[] = [];
      const startedAt = Date.now();
      let stopReason: string | undefined;

      // One request at a time, in search order: Dynadot allows a single
      // in-flight request per account, and concurrent calls can get the account
      // temporarily banned. The loop stops at the first failure so a rejected
      // or throttled command cannot burn the remaining budget.
      for (const domain of domains) {
        if (Date.now() - startedAt > dynadotSearchBudgetMs) {
          stopReason = 'Dynadot search budget exhausted';
          break;
        }

        const requestStartedAt = Date.now();
        const outcome = await checkDynadotDomain(
          endpoint,
          config.apiKey!,
          domain,
          mode,
          dynadotRequestTimeoutMs
        );

        if (!outcome.ok) {
          stopReason = outcome.reason;
          break;
        }

        checked.push(outcome.result);

        if (checked.length < domains.length) {
          const elapsed = Date.now() - requestStartedAt;
          if (elapsed < dynadotRequestIntervalMs) {
            await sleep(dynadotRequestIntervalMs - elapsed);
          }
        }
      }

      if (checked.length === domains.length) return checked;

      // Only the domains that were actually answered stay verified; the rest
      // are reported as unverified with the reason the checks stopped.
      const remaining = domains.slice(checked.length);
      const fallback = await checkFallbackProvider(
        fallbackProvider,
        remaining,
        stopReason ?? 'Dynadot did not answer'
      );

      return [...checked, ...fallback];
    },
  };
}
function createNamecheapProvider(): RegistrarProvider {
  const { config, missing } = readNamecheapConfig();

  if (missing.length > 0) {
    return createMockProvider(`Missing Namecheap env vars: ${missing.join(', ')}`);
  }

  return {
    provider: 'namecheap',
    mode: config.sandbox ? 'sandbox' : 'live',
    async checkDomains(domains) {
      const endpoint = config.sandbox
        ? 'https://api.sandbox.namecheap.com/xml.response'
        : 'https://api.namecheap.com/xml.response';
      const url = new URL(endpoint);

      url.searchParams.set('ApiUser', config.apiUser!);
      url.searchParams.set('ApiKey', config.apiKey!);
      url.searchParams.set('UserName', config.username!);
      url.searchParams.set('ClientIp', config.clientIp!);
      url.searchParams.set('Command', 'namecheap.domains.check');
      url.searchParams.set('DomainList', domains.join(','));

      try {
        const response = await fetch(url.toString(), { method: 'GET' });
        const xml = await response.text();

        if (!response.ok) {
          return createMockProvider(`Namecheap HTTP ${response.status}`).checkDomains(domains);
        }

        const errors = parseNamecheapErrors(xml);
        if (errors.length > 0 || !xml.includes('Status="OK"')) {
          return createMockProvider(
            errors[0] || 'Namecheap returned a non-OK response'
          ).checkDomains(domains);
        }

        const checkedAt = new Date().toISOString();
        const byDomain = new Map(parseAttributes(xml).map((attrs) => [attrs.Domain, attrs]));

        return domains.map((domain) => {
          const attrs = byDomain.get(domain);
          if (!attrs) {
            return fakeAvailability(domain, 'Namecheap response omitted domain result');
          }

          const available = attrs.Available === 'true';
          const premium = attrs.IsPremiumName === 'true';
          const premiumPrice = Number(attrs.PremiumRegistrationPrice || 0);

          return {
            domain,
            available,
            price: available && premium && premiumPrice > 0 ? premiumPrice : null,
            currency: 'USD',
            provider: 'namecheap',
            mode: config.sandbox ? 'sandbox' : 'live',
            checkedAt,
            registrationUrl: buildNamecheapRegistrationUrl(domain),
            metadata: {
              premium,
              errorNo: attrs.ErrorNo,
              description: attrs.Description,
              icannFee: attrs.IcannFee,
              eapFee: attrs.EapFee,
              verified: true,
            },
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Namecheap request failed';
        return createMockProvider(message).checkDomains(domains);
      }
    },
  };
}

function createPreferredProvider(): RegistrarProvider {
  const mockProvider = createMockProvider('No live registrar provider configured');
  const namecheapProvider = namecheapIsConfigured() ? createNamecheapProvider() : mockProvider;
  return createDynadotProvider(namecheapProvider);
}

function withRegistrationUrls(results: Array<Record<string, unknown>>) {
  return results.map((result) => ({
    ...result,
    registrationUrl: result.affiliate_url,
  }));
}

function domainMetadataByName(candidates: GenerationCandidate[], selectedTlds: string[]) {
  const metadata = new Map<string, GenerationCandidate>();

  for (const candidate of candidates) {
    for (const tld of selectedTlds) {
      metadata.set(`${candidate.label}.${tld}`, candidate);
    }
  }

  return metadata;
}

function domainsToCheck(candidates: GenerationCandidate[], selectedTlds: string[]) {
  const byStrategy = new Map<GenerationStrategy, GenerationCandidate[]>();

  for (const candidate of candidates) {
    byStrategy.set(candidate.strategy, [...(byStrategy.get(candidate.strategy) ?? []), candidate]);
  }

  const orderedCandidates: GenerationCandidate[] = [];
  let offset = 0;

  while (orderedCandidates.length < candidates.length) {
    let added = false;

    for (const strategy of GENERATION_STRATEGIES) {
      const candidate = byStrategy.get(strategy)?.[offset];
      if (candidate) {
        orderedCandidates.push(candidate);
        added = true;
      }
    }

    if (!added) break;
    offset += 1;
  }

  return orderedCandidates
    .flatMap((candidate) => selectedTlds.map((tld) => `${candidate.label}.${tld}`))
    .slice(0, maxDomainsPerSearch);
}

async function latestResults(supabase: ReturnType<typeof createClient>, projectId: string) {
  const { data: search, error: searchError } = await supabase
    .from('dotcomseekr_searches')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (searchError) throw new Error(searchError.message);
  if (!search) return { search: null, results: [] };

  const { data: results, error: resultsError } = await supabase
    .from('dotcomseekr_domain_results')
    .select('*')
    .eq('search_id', search.id)
    .order('created_at', { ascending: true });

  if (resultsError) throw new Error(resultsError.message);
  return { search, results: withRegistrationUrls(results ?? []) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(req, { ok: true });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const projectId = String(body.projectId ?? body.project_id ?? '').trim();
    const query = String(body.query ?? '').trim();
    const industry = String(body.industry ?? '').trim();
    const tone = String(body.tone ?? '').trim();
    const selectedTlds = parseTlds(body.tlds);
    const tlds = selectedTlds.length > 0 ? selectedTlds : defaultTlds;

    if (!projectId) return json(req, { error: 'projectId is required' }, 400);

    const supabase = getClient();

    if (!query) {
      const data = await latestResults(supabase, projectId);
      return json(req, data);
    }

    const candidates = generateDomainCandidates({
      seed: query,
      useCase: industry,
      tone,
      maxCandidates: 250,
    });
    if (candidates.length === 0) {
      return json(req, { error: 'query must contain a valid domain label' }, 400);
    }

    const provider = createPreferredProvider();
    const domains = domainsToCheck(candidates, tlds);
    const metadataByDomain = domainMetadataByName(candidates, tlds);
    const availabilityResults = await provider.checkDomains(domains);
    // Report the provider that actually answered: a search where later checks
    // fell back is still a live search for the domains that were answered.
    const verifiedResults = availabilityResults.filter((result) => result.verified);
    const answeringResults = verifiedResults.length > 0 ? verifiedResults : availabilityResults;
    const firstProvider = answeringResults[0]?.provider ?? 'mock';
    const providerName = answeringResults.every((result) => result.provider === firstProvider)
      ? firstProvider
      : 'mock';
    const firstMode = answeringResults[0]?.mode ?? 'mock';
    const providerMode = answeringResults.every((result) => result.mode === firstMode)
      ? firstMode
      : 'mock';
    const providerMetadata = {
      provider: providerName,
      mode: providerName === 'mock' ? 'mock' : providerMode,
      checkedAt: availabilityResults[0]?.checkedAt ?? new Date().toISOString(),
      fallbackReason:
        availabilityResults.find((result) => result.fallbackReason)?.fallbackReason ||
        (providerName === 'mock' ? provider.fallbackReason || 'Mock provider selected' : undefined),
    };

    const { data: search, error: searchError } = await supabase
      .from('dotcomseekr_searches')
      .insert({
        project_id: projectId,
        query,
        tlds,
        provider: providerName,
        status: 'completed',
        metadata: {
          source: 'dotcomseekr-edge',
          industry,
          tone,
          candidateCount: candidates.length,
          ...providerMetadata,
        },
      })
      .select()
      .single();

    if (searchError) return json(req, { error: searchError.message }, 500);

    const rows = availabilityResults.map((availability) => {
      const candidate = metadataByDomain.get(availability.domain);

      return {
        search_id: search.id,
        domain: availability.domain,
        available: availability.available,
        price: availability.price,
        currency: availability.currency,
        provider: availability.provider,
        affiliate_url: availability.registrationUrl,
        metadata: {
          ...availability.metadata,
          strategy: candidate?.strategy,
          strategyLabel: candidate?.strategyLabel,
          rationale: candidate?.rationale,
          sourceTerm: candidate?.sourceTerm,
          score: candidate?.score?.total,
          scoreComponents: candidate?.scoreComponents,
          provenance: candidate?.provenance,
          seedQuery: query,
          industry,
          tone,
          provider: availability.provider,
          mode: availability.mode,
          checkedAt: availability.checkedAt,
          fallbackReason: availability.fallbackReason,
          registrationUrl: availability.registrationUrl,
        },
      };
    });

    const { data: results, error: resultsError } = await supabase
      .from('dotcomseekr_domain_results')
      .insert(rows)
      .select();

    if (resultsError) return json(req, { error: resultsError.message }, 500);

    return json(req, {
      provider: providerMetadata.provider,
      mode: providerMetadata.mode,
      checkedAt: providerMetadata.checkedAt,
      search,
      results: withRegistrationUrls(results ?? []),
      providerMetadata,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return json(req, { error: message }, 500);
  }
});
