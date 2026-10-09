// Single-source registrar provider resolution for Supabase Edge Functions.
//
// This module is NOT a second availability system. It hosts the one
// authoritative provider chain (Dynadot -> Namecheap -> deterministic mock)
// that resolves live registrar credentials from Supabase secrets. The bulk
// `dotcomseekr-domain-search` function and the single-domain
// `dotcomseekr-availability` function both import it, so provider selection
// and credential handling live in exactly one place.
//
// Provider credentials are read from `Deno.env` here and never leave the
// server. Nothing in this file is imported by the web app.

export type ProviderMode = 'sandbox' | 'live' | 'mock';
export type ProviderName = 'mock' | 'namecheap' | 'dynadot';

export type AvailabilityResult = {
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

export type RegistrarProvider = {
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
  if (status === 429 || normalized.includes('rate') || normalized.includes('too many')) {
    return 'Dynadot rate limit reached';
  }
  if (status && status >= 500) return `Dynadot endpoint unavailable: HTTP ${status}`;
  if (message.includes('No Dynadot search results')) return 'Dynadot returned malformed JSON';
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

function dynadotResponseMessage(searchResponse: DynadotSearchResponse['SearchResponse']) {
  const candidates = [
    searchResponse?.Error,
    searchResponse?.ErrorMessage,
    searchResponse?.Message,
  ];

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
        ? 'https://api-sandbox.dynadot.com/api3.json'
        : 'https://api.dynadot.com/api3.json';

      try {
        if (configError) {
          logDynadotFallback(configError, { mode: config.sandbox ? 'sandbox' : 'live' });
          return checkFallbackProvider(fallbackProvider, domains, configError);
        }

        const checkedAt = new Date().toISOString();
        const response = await fetch(buildDynadotSearchUrl(endpoint, config.apiKey!, domains), {
          method: 'GET',
        });

        if (!response.ok) {
          const fallbackReason = normalizeDynadotFallbackReason(
            `Dynadot HTTP ${response.status}`,
            response.status
          );
          logDynadotFallback(fallbackReason, {
            status: response.status,
            mode: config.sandbox ? 'sandbox' : 'live',
            requestedCount: domains.length,
          });
          return checkFallbackProvider(fallbackProvider, domains, fallbackReason);
        }

        let payload: DynadotSearchResponse;
        try {
          payload = (await response.json()) as DynadotSearchResponse;
        } catch {
          const fallbackReason = 'Dynadot returned invalid JSON';
          logDynadotFallback(fallbackReason, {
            status: response.status,
            mode: config.sandbox ? 'sandbox' : 'live',
            requestedCount: domains.length,
          });
          return checkFallbackProvider(fallbackProvider, domains, fallbackReason);
        }

        const searchResponse = payload.SearchResponse;
        const responseCode =
          searchResponse?.ResponseCode !== undefined && searchResponse.ResponseCode !== null
            ? String(searchResponse.ResponseCode)
            : undefined;
        const responseMessage = dynadotResponseMessage(searchResponse);

        if (responseCode !== '0') {
          const fallbackReason = normalizeDynadotFallbackReason(
            responseMessage || `Dynadot returned ResponseCode ${responseCode ?? 'missing'}`,
            response.status
          );
          logDynadotFallback(fallbackReason, {
            status: response.status,
            responseCode: responseCode ?? null,
            responseMessage: responseMessage ?? null,
            mode: config.sandbox ? 'sandbox' : 'live',
            requestedCount: domains.length,
          });
          return checkFallbackProvider(fallbackProvider, domains, fallbackReason);
        }

        const searchResults = dynadotSearchResults(searchResponse?.SearchResults);
        if (!searchResults) {
          const fallbackReason = 'Dynadot returned malformed JSON';
          logDynadotFallback(fallbackReason, {
            status: response.status,
            responseCode,
            mode: config.sandbox ? 'sandbox' : 'live',
            requestedCount: domains.length,
          });
          return checkFallbackProvider(fallbackProvider, domains, fallbackReason);
        }

        const byDomain = new Map(
          searchResults
            .filter((result) => typeof result.DomainName === 'string')
            .map((result) => [String(result.DomainName).toLowerCase(), result])
        );

        const missingDomains = domains.filter((domain) => !byDomain.has(domain.toLowerCase()));
        if (missingDomains.length > 0) {
          const fallbackReason = 'Dynadot response omitted domain result';
          logDynadotFallback(fallbackReason, {
            status: response.status,
            responseCode,
            mode: config.sandbox ? 'sandbox' : 'live',
            requestedCount: domains.length,
            resultCount: searchResults.length,
            missingCount: missingDomains.length,
          });
          return checkFallbackProvider(fallbackProvider, domains, fallbackReason);
        }

        const malformedCount = domains.filter((domain) => {
          const result = byDomain.get(domain.toLowerCase());
          return typeof result?.Available !== 'string';
        }).length;

        if (malformedCount > 0) {
          const fallbackReason = 'Dynadot returned malformed domain result';
          logDynadotFallback(fallbackReason, {
            status: response.status,
            responseCode,
            mode: config.sandbox ? 'sandbox' : 'live',
            requestedCount: domains.length,
            resultCount: searchResults.length,
            malformedCount,
          });
          return checkFallbackProvider(fallbackProvider, domains, fallbackReason);
        }

        return domains.map((domain) => {
          const result = byDomain.get(domain.toLowerCase())!;
          const domainName = String(result.DomainName);
          const availableRaw = String(result.Available ?? '').toLowerCase();
          const priceRaw = typeof result.Price === 'string' ? result.Price : undefined;
          const price = parseDynadotPrice(priceRaw);

          return {
            domain: domainName,
            available: availableRaw === 'yes',
            price: availableRaw === 'yes' ? price.price : null,
            currency: price.currency,
            provider: 'dynadot',
            mode: config.sandbox ? 'sandbox' : 'live',
            checkedAt,
            registrationUrl: buildDynadotRegistrationUrl(domainName),
            metadata: {
              premium: price.premium,
              responseCode,
              priceText: priceRaw,
            },
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Dynadot request failed';
        const fallbackReason = normalizeDynadotFallbackReason(message);
        logDynadotFallback(fallbackReason, {
          mode: config.sandbox ? 'sandbox' : 'live',
          requestedCount: domains.length,
        });
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

export function createPreferredProvider(): RegistrarProvider {
  const mockProvider = createMockProvider('No live registrar provider configured');
  const namecheapProvider = namecheapIsConfigured() ? createNamecheapProvider() : mockProvider;
  return createDynadotProvider(namecheapProvider);
}
