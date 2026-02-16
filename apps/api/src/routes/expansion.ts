import { FastifyInstance } from 'fastify';
import { getSupabaseClient } from '../services/supabase';
import { DeterministicExpander, ExpansionStrategy } from '@dotcomseekr/engine';
import { join } from 'path';
import { randomUUID } from 'crypto';

const lexiconPath = join(process.cwd(), '../../../lexicon');
const expander = new DeterministicExpander(lexiconPath);

// Initialize expander
expander.initialize().catch((err) => {
  console.error('Failed to initialize expander:', err);
});

export async function expansionRoutes(server: FastifyInstance) {
  // Trigger expansion for a project
  server.post('/api/v1/projects/:id/expand', async (request, reply) => {
    const { id: projectId } = request.params as { id: string };
    const {
      maxDepth = 2,
      maxNodes = 500,
      strategies = Object.values(ExpansionStrategy),
      enablePrefixes = true,
      enableSuffixes = true,
    } = request.body as {
      maxDepth?: number;
      maxNodes?: number;
      strategies?: ExpansionStrategy[];
      enablePrefixes?: boolean;
      enableSuffixes?: boolean;
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

      // Log expansion started event
      await supabase.from('events').insert({
        project_id: projectId,
        user_id: project.user_id,
        event_type: 'expansion_started',
        payload: { maxDepth, maxNodes, strategies },
        success: true,
      });

      // Run expansion
      const result = await expander.expandWithOptions(project.initial_phrase, {
        maxDepth,
        maxNodes,
        strategies,
        enablePrefixes,
        enableSuffixes,
      });

      // Save graph nodes
      const nodeRecords = result.nodes.map((value, index) => ({
        id: randomUUID(),
        project_id: projectId,
        node_type: index === 0 ? 'phrase' : 'word',
        value,
        normalized_value: value.toLowerCase(),
        semantic_weight: 0.5,
        depth_level: 0, // TODO: Track actual depth from expansion
        is_terminal: false,
        metadata: {},
      }));

      if (nodeRecords.length > 0) {
        const { error: nodesError } = await supabase
          .from('graph_nodes')
          .insert(nodeRecords);

        if (nodesError) {
          console.error('Failed to save nodes:', nodesError);
        }
      }

      // Save graph edges
      const edgeRecords = result.edges.map((edge) => ({
        id: randomUUID(),
        project_id: projectId,
        source_node_id: edge.source,
        target_node_id: edge.target,
        edge_type: edge.type.toLowerCase(),
        weight: 0.5,
        source_system: 'lexicon',
        source_confidence: 0.8,
        metadata: {},
      }));

      if (edgeRecords.length > 0) {
        const { error: edgesError } = await supabase
          .from('graph_edges')
          .insert(edgeRecords);

        if (edgesError) {
          console.error('Failed to save edges:', edgesError);
        }
      }

      // Log expansion completed event
      const duration = Date.now() - startTime;
      await supabase.from('events').insert({
        project_id: projectId,
        user_id: project.user_id,
        event_type: 'expansion_completed',
        payload: {
          totalNodes: result.nodes.length,
          totalEdges: result.edges.length,
          strategies,
        },
        success: true,
        duration_ms: duration,
      });

      return reply.send({
        success: true,
        nodes: result.nodes,
        edges: result.edges,
        metadata: result.metadata,
        duration: duration,
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Log expansion failed event
      await supabase.from('events').insert({
        project_id: projectId,
        user_id: 'temp-user-id',
        event_type: 'expansion_completed',
        payload: { error: error.message },
        success: false,
        error_message: error.message,
        duration_ms: duration,
      });

      return reply.status(500).send({ error: error.message });
    }
  });

  // Trigger recombination for a project
  server.post('/api/v1/projects/:id/recombine', async (request, reply) => {
    const { id: projectId } = request.params as { id: string };
    const {
      maxLength = 20,
      minLength = 3,
      maxCandidates = 500,
      allowHyphens = false,
      allowNumbers = false,
    } = request.body as {
      maxLength?: number;
      minLength?: number;
      maxCandidates?: number;
      allowHyphens?: boolean;
      allowNumbers?: boolean;
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

      // Get graph nodes
      const { data: nodes, error: nodesError } = await supabase
        .from('graph_nodes')
        .select('value')
        .eq('project_id', projectId);

      if (nodesError) {
        return reply.status(500).send({ error: nodesError.message });
      }

      if (!nodes || nodes.length === 0) {
        return reply.status(400).send({ error: 'No nodes found. Run expansion first.' });
      }

      // Log recombination started
      await supabase.from('events').insert({
        project_id: projectId,
        user_id: project.user_id,
        event_type: 'recombination_run',
        payload: { nodeCount: nodes.length, maxCandidates },
        success: true,
      });

      // Import recombiner dynamically
      const { Recombiner } = await import('@dotcomseekr/engine');
      const recombiner = new Recombiner();

      const nodeValues = nodes.map((n: any) => n.value);
      const candidates = recombiner.recombineWithOptions(nodeValues, {
        maxLength,
        minLength,
        maxCandidates,
        allowHyphens,
        allowNumbers,
      });

      // Score candidates
      const { DomainScorer } = await import('@dotcomseekr/engine');
      const scorer = new DomainScorer();

      const scoredCandidates = candidates.map((domain) => {
        const scores = scorer.score(domain, project.initial_phrase);
        return {
          id: randomUUID(),
          project_id: projectId,
          domain_name: domain,
          tld: 'com',
          source_node_ids: [], // TODO: Track actual source nodes
          recombination_strategy: 'linear',
          score_total: scores.total,
          score_pronounceability: scores.pronounceability,
          score_brandability: scores.brandability,
          score_semantic_fit: scores.semanticFit,
          score_technical_quality: scores.technicalQuality,
          scoring_metadata: {},
          availability_status: 'unknown',
        };
      });

      // Save candidates to database
      if (scoredCandidates.length > 0) {
        const { error: candidatesError } = await supabase
          .from('candidates')
          .insert(scoredCandidates);

        if (candidatesError) {
          console.error('Failed to save candidates:', candidatesError);
        }
      }

      const duration = Date.now() - startTime;

      // Log candidates generated event
      await supabase.from('events').insert({
        project_id: projectId,
        user_id: project.user_id,
        event_type: 'candidates_generated',
        payload: { candidateCount: scoredCandidates.length },
        success: true,
        duration_ms: duration,
      });

      return reply.send({
        success: true,
        candidates: scoredCandidates.slice(0, 50), // Return top 50
        total: scoredCandidates.length,
        duration,
      });
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  // Get graph for a project
  server.get('/api/v1/projects/:id/graph', async (request, reply) => {
    const { id: projectId } = request.params as { id: string };
    const supabase = getSupabaseClient();

    const { data: nodes, error: nodesError } = await supabase
      .from('graph_nodes')
      .select('*')
      .eq('project_id', projectId);

    if (nodesError) {
      return reply.status(500).send({ error: nodesError.message });
    }

    const { data: edges, error: edgesError } = await supabase
      .from('graph_edges')
      .select('*')
      .eq('project_id', projectId);

    if (edgesError) {
      return reply.status(500).send({ error: edgesError.message });
    }

    return reply.send({ nodes, edges });
  });

  // Get candidates for a project
  server.get('/api/v1/projects/:id/candidates', async (request, reply) => {
    const { id: projectId } = request.params as { id: string };
    const { minScore = 0 } = request.query as { minScore?: number };

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .eq('project_id', projectId)
      .gte('score_total', minScore)
      .order('score_total', { ascending: false });

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send(data);
  });
}
