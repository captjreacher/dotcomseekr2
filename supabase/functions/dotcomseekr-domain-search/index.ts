import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'http://localhost:5173',
  'https://dotcomseekr.staging.maximisedai.com',
]);
const defaultTlds = ['com', 'ai', 'io', 'co'];
const allowedTlds = new Set(['com', 'ai', 'io', 'co', 'net', 'org']);
const maxDomainsPerSearch = 36;

type CandidateStrategy =
  | 'exact'
  | 'prefix'
  | 'suffix'
  | 'related'
  | 'wordplay'
  | 'premium';

type DomainCandidate = {
  label: string;
  strategy: CandidateStrategy;
  strategyLabel: string;
  rationale: string;
};

const candidateStrategyOrder: CandidateStrategy[] = [
  'exact',
  'prefix',
  'suffix',
  'related',
  'wordplay',
  'premium',
];

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
  metadata: Record<string, unknown>;
};

type RegistrarProvider = {
  provider: ProviderName;
  mode: ProviderMode;
  fallbackReason?: string;
  checkDomains(domains: string[]): Promise<AvailabilityResult[]>;
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

function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 48);
}

function normalizeWords(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((word) => word.trim())
    .filter(Boolean);
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

function strategyLabel(strategy: CandidateStrategy) {
  switch (strategy) {
    case 'exact':
      return 'Exact match';
    case 'prefix':
      return 'Prefix ideas';
    case 'suffix':
      return 'Suffix ideas';
    case 'related':
      return 'Related-word ideas';
    case 'wordplay':
      return 'Brandable wordplay';
    case 'premium':
      return 'Premium/startup style';
  }
}

function relatedTerms(seed: string, industry: string) {
  const relatedBySeed: Record<string, string[]> = {
    agent: ['operator', 'proxy', 'delegate', 'copilot'],
    automation: ['workflow', 'autopilot', 'sequence', 'process'],
    tradie: ['craft', 'crew', 'jobsite', 'toolbox'],
    ledger: ['books', 'balance', 'record', 'vault'],
    groovy: ['vibe', 'rhythm', 'spark', 'jam'],
    finance: ['ledger', 'capital', 'balance', 'vault'],
    ai: ['agent', 'model', 'neural', 'prompt'],
  };

  const industryWords = normalizeWords(industry);
  const industryHints = industryWords.flatMap((word) => relatedBySeed[word] ?? [word]);
  return [...new Set([...(relatedBySeed[seed] ?? []), ...industryHints])].slice(0, 4);
}

function withoutVowels(value: string) {
  const head = value.slice(0, 1);
  const tail = value.slice(1).replace(/[aeiou]/g, '');
  return `${head}${tail}`;
}

function buildDomainCandidates(query: string, industry = '', tone = '') {
  const words = normalizeWords(query);
  const seed = words[0] ?? normalizeLabel(query);
  const compact = normalizeLabel(query);
  const candidates: DomainCandidate[] = [];
  const seen = new Set<string>();

  function add(label: string, strategy: CandidateStrategy, rationale: string) {
    const clean = normalizeLabel(label);
    if (!clean || clean.length < 3 || seen.has(clean)) return;
    seen.add(clean);
    candidates.push({
      label: clean,
      strategy,
      strategyLabel: strategyLabel(strategy),
      rationale,
    });
  }

  add(compact || seed, 'exact', 'Uses your seed word directly');

  ['get', 'try', 'go', 'use'].forEach((prefix) => {
    add(`${prefix}${seed}`, 'prefix', `Adds the "${prefix}" prefix for a clearer action cue`);
  });

  ['hub', 'labs', 'works', 'flow', 'base'].forEach((suffix) => {
    add(`${seed}${suffix}`, 'suffix', 'Adds an action-oriented suffix');
  });

  relatedTerms(seed, industry).forEach((related) => {
    add(related, 'related', 'Related concept with stronger brand feel');
    add(`${related}${seed}`, 'related', 'Combines a related concept with your seed word');
  });

  add(withoutVowels(seed), 'wordplay', 'Shorter, more startup-friendly variant');
  add(`${seed}ly`, 'wordplay', 'Softens the seed word into a brandable name');
  add(`${seed}ify`, 'wordplay', 'Turns the seed word into a playful product-style name');

  const premiumSuffixes = tone.toLowerCase().includes('premium')
    ? ['capital', 'prime', 'vault']
    : ['studio', 'forge', 'nova'];

  premiumSuffixes.forEach((suffix) => {
    add(`${seed}${suffix}`, 'premium', 'Frames the seed word with a polished startup feel');
  });

  return candidates.slice(0, 18);
}

function hash(value: string) {
  let total = 0;
  for (let i = 0; i < value.length; i++) {
    total = (total * 31 + value.charCodeAt(i)) >>> 0;
  }
  return total;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function tagValue(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : undefined;
}

function parseDynadotErrors(xml: string) {
  return [...xml.matchAll(/<Error[^>]*>([\s\S]*?)<\/Error>/gi)].map((match) =>
    decodeXml(match[1].trim())
  );
}

function normalizeDynadotFallbackReason(message: string, status?: number) {
  const normalized = message.toLowerCase();
  if (status === 401 || status === 403 || normalized.includes('api key')) {
    return 'Dynadot invalid API key or API access denied';
  }
  if (status === 429 || normalized.includes('rate') || normalized.includes('too many')) {
    return 'Dynadot rate limit reached';
  }
  if (status && status >= 500) return `Dynadot endpoint unavailable: HTTP ${status}`;
  if (message.includes('No Dynadot search results')) return 'Dynadot returned malformed XML';
  return message;
}

async function checkFallbackProvider(
  fallbackProvider: RegistrarProvider,
  domains: string[],
  fallbackReason: string
) {
  const results = await fallbackProvider.checkDomains(domains);

  return results.map((result) => ({
    ...result,
    fallbackReason: result.fallbackReason ?? fallbackReason,
    metadata: {
      ...result.metadata,
      fallbackReason: result.fallbackReason ?? fallbackReason,
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

function createDynadotProvider(fallbackProvider: RegistrarProvider): RegistrarProvider {
  const { config, hasApiKey, configError } = readDynadotConfig();

  if (!hasApiKey) {
    return fallbackProvider;
  }

  return {
    provider: 'dynadot',
    mode: config.sandbox ? 'sandbox' : 'live',
    async checkDomains(domains) {
      const endpoint = config.sandbox
        ? 'https://api-sandbox.dynadot.com/api3.xml'
        : 'https://api.dynadot.com/api3.xml';
      const url = new URL(endpoint);

      url.searchParams.set('key', config.apiKey!);
      url.searchParams.set('command', 'search');
      url.searchParams.set('show_price', '1');
      url.searchParams.set('currency', 'USD');

      try {
        if (configError) {
          return checkFallbackProvider(fallbackProvider, domains, configError);
        }

        const checkedAt = new Date().toISOString();
        const results: AvailabilityResult[] = [];

        for (const [index, domain] of domains.entries()) {
          if (index > 0 && !config.sandbox) await sleep(1100);

          url.searchParams.delete('domain0');
          url.searchParams.set('domain0', domain);

          const response = await fetch(url.toString(), { method: 'GET' });
          const xml = await response.text();

          if (!response.ok) {
            const fallbackReason = normalizeDynadotFallbackReason(
              `Dynadot HTTP ${response.status}`,
              response.status
            );
            return checkFallbackProvider(fallbackProvider, domains, fallbackReason);
          }

          const errors = parseDynadotErrors(xml);
          if (errors.length > 0) {
            const fallbackReason = normalizeDynadotFallbackReason(errors[0], response.status);
            return checkFallbackProvider(fallbackProvider, domains, fallbackReason);
          }

          const responseBlock = xml.match(/<SearchResponse[^>]*>([\s\S]*?)<\/SearchResponse>/i);
          if (!responseBlock) {
            const fallbackReason = normalizeDynadotFallbackReason('No Dynadot search results');
            return checkFallbackProvider(fallbackProvider, domains, fallbackReason);
          }

          const resultXml = tagValue(responseBlock[1], 'SearchHeader') ?? responseBlock[1];
          const responseDomain = tagValue(resultXml, 'DomainName');
          const successCode = tagValue(resultXml, 'SuccessCode');
          const availableRaw = tagValue(resultXml, 'Available');
          const priceRaw = tagValue(resultXml, 'Price');

          if (responseDomain !== domain || successCode !== '0' || !availableRaw) {
            const fallbackReason = 'Dynadot returned malformed XML';
            return checkFallbackProvider(fallbackProvider, domains, fallbackReason);
          }

          const price = parseDynadotPrice(priceRaw);

          results.push({
            domain,
            available: availableRaw.toLowerCase() === 'yes',
            price: availableRaw.toLowerCase() === 'yes' ? price.price : null,
            currency: price.currency,
            provider: 'dynadot',
            mode: config.sandbox ? 'sandbox' : 'live',
            checkedAt,
            registrationUrl: buildDynadotRegistrationUrl(domain),
            metadata: {
              premium: price.premium,
              successCode,
              priceText: priceRaw,
            },
          });
        }

        return results;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Dynadot request failed';
        const fallbackReason = normalizeDynadotFallbackReason(message);
        return checkFallbackProvider(fallbackProvider, domains, fallbackReason);
      }
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

function domainMetadataByName(candidates: DomainCandidate[], selectedTlds: string[]) {
  const metadata = new Map<string, DomainCandidate>();

  for (const candidate of candidates) {
    for (const tld of selectedTlds) {
      metadata.set(`${candidate.label}.${tld}`, candidate);
    }
  }

  return metadata;
}

function domainsToCheck(candidates: DomainCandidate[], selectedTlds: string[]) {
  const byStrategy = new Map<CandidateStrategy, DomainCandidate[]>();

  for (const candidate of candidates) {
    byStrategy.set(candidate.strategy, [...(byStrategy.get(candidate.strategy) ?? []), candidate]);
  }

  const orderedCandidates: DomainCandidate[] = [];
  let offset = 0;

  while (orderedCandidates.length < candidates.length) {
    let added = false;

    for (const strategy of candidateStrategyOrder) {
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

    const labels = buildDomainCandidates(query, industry, tone);
    if (labels.length === 0) {
      return json(req, { error: 'query must contain a valid domain label' }, 400);
    }

    const provider = createPreferredProvider();
    const domains = domainsToCheck(labels, tlds);
    const metadataByDomain = domainMetadataByName(labels, tlds);
    const availabilityResults = await provider.checkDomains(domains);
    const firstProvider = availabilityResults[0]?.provider ?? 'mock';
    const providerName = availabilityResults.every((result) => result.provider === firstProvider)
      ? firstProvider
      : 'mock';
    const firstMode = availabilityResults[0]?.mode ?? 'mock';
    const providerMode = availabilityResults.every((result) => result.mode === firstMode)
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
          candidateCount: labels.length,
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
