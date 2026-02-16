import { FastifyInstance } from 'fastify';
import { getSupabaseClient } from '../services/supabase';
import { MockRegistrationProvider } from '@dotcomseekr/engine';

const availabilityProvider = new MockRegistrationProvider();

export async function availabilityRoutes(server: FastifyInstance) {
  // Check availability for a single domain
  server.get('/api/v1/availability/:domain', async (request, reply) => {
    const { domain } = request.params as { domain: string };
    const { tld = 'com' } = request.query as { tld?: string };

    try {
      // Remove TLD if included in domain param
      const cleanDomain = domain.replace(/\.(com|net|org|io)$/, '');

      const result = await availabilityProvider.checkAvailability(cleanDomain, tld);

      return reply.send({
        domain: `${cleanDomain}.${tld}`,
        ...result,
      });
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  // Check availability for project candidates
  server.post('/api/v1/projects/:id/check-availability', async (request, reply) => {
    const { id: projectId } = request.params as { id: string };
    const { candidateIds, limit = 50 } = request.body as {
      candidateIds?: string[];
      limit?: number;
    };

    const startTime = Date.now();
    const supabase = getSupabaseClient();

    try {
      // Get project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projectError || !project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      // Get candidates
      let query = supabase
        .from('candidates')
        .select('*')
        .eq('project_id', projectId);

      if (candidateIds && candidateIds.length > 0) {
        query = query.in('id', candidateIds);
      } else {
        query = query.order('score_total', { ascending: false }).limit(limit);
      }

      const { data: candidates, error: candidatesError } = await query;

      if (candidatesError) {
        return reply.status(500).send({ error: candidatesError.message });
      }

      if (!candidates || candidates.length === 0) {
        return reply.send({ checked: 0, available: 0, premium: 0 });
      }

      // Log availability check started
      await supabase.from('events').insert({
        project_id: projectId,
        user_id: project.user_id,
        event_type: 'availability_check_started',
        payload: { candidateCount: candidates.length },
        success: true,
      });

      // Check availability for each candidate
      const updates: Array<{
        id: string;
        availability_status: string;
        availability_data: Record<string, unknown>;
      }> = [];

      let availableCount = 0;
      let premiumCount = 0;

      for (const candidate of candidates) {
        const result = await availabilityProvider.checkAvailability(
          candidate.domain_name,
          candidate.tld
        );

        const status = result.available ? (result.premium ? 'premium' : 'available') : 'taken';

        updates.push({
          id: candidate.id,
          availability_status: status,
          availability_data: {
            available: result.available,
            premium: result.premium,
            priceCents: result.priceCents,
            checkedAt: new Date().toISOString(),
          },
        });

        if (result.available) {
          availableCount++;
          if (result.premium) premiumCount++;
        }
      }

      // Batch update candidates
      for (const update of updates) {
        await supabase
          .from('candidates')
          .update({
            availability_status: update.availability_status,
            availability_data: update.availability_data,
          })
          .eq('id', update.id);
      }

      const duration = Date.now() - startTime;

      // Log completion
      await supabase.from('events').insert({
        project_id: projectId,
        user_id: project.user_id,
        event_type: 'availability_check_completed',
        payload: {
          checked: candidates.length,
          available: availableCount,
          premium: premiumCount,
        },
        success: true,
        duration_ms: duration,
      });

      return reply.send({
        checked: candidates.length,
        available: availableCount,
        premium: premiumCount,
        duration,
      });
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });
}
