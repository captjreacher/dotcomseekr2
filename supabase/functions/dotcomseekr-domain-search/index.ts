import {
  GENERATION_STRATEGIES,
  generateDomainCandidates,
  type GenerationCandidate,
  type GenerationStrategy,
} from '../_shared/generation.ts';
import { getClient, json, parseTlds } from '../_shared/http.ts';
import { createPreferredProvider } from '../_shared/registrar.ts';

const defaultTlds = ['com', 'ai', 'io', 'co'];
const maxDomainsPerSearch = 36;

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

async function latestResults(supabase: ReturnType<typeof getClient>, projectId: string) {
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
