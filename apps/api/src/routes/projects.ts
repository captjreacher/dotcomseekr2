import { FastifyInstance } from 'fastify';
import { getSupabaseClient } from '../services/supabase';

export async function projectRoutes(server: FastifyInstance) {
  // Create new project
  server.post('/api/v1/projects', async (request, reply) => {
    const { name, description, initialPhrase, settings } = request.body as {
      name: string;
      description?: string;
      initialPhrase: string;
      settings?: Record<string, unknown>;
    };

    // TODO: Get userId from auth
    const userId = 'temp-user-id';

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        name,
        description,
        initial_phrase: initialPhrase,
        settings: settings || {},
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.status(201).send(data);
  });

  // Get project by ID
  server.get('/api/v1/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return reply.send(data);
  });

  // List user's projects
  server.get('/api/v1/projects', async (request, reply) => {
    // TODO: Get userId from auth
    const userId = 'temp-user-id';

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send(data);
  });

  // Update project
  server.patch('/api/v1/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Record<string, unknown>;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send(data);
  });

  // Delete project
  server.delete('/api/v1/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const supabase = getSupabaseClient();
    const { error } = await supabase.from('projects').delete().eq('id', id);

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.status(204).send();
  });
}
