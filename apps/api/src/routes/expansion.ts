import { FastifyInstance } from 'fastify';
import { getSupabaseClient } from '../services/supabase';
import { HybridExpander, ExpansionStrategy } from '@dotcomseekr/engine';
import { join } from 'path';
import { randomUUID } from 'crypto';

const lexiconPath = join(process.cwd(), '../../../lexicon');
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const expander = new HybridExpander(lexiconPath, anthropicApiKey);

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
      enableLLM = false,
      llmTopN = 10,
      llmMode = 'EXPLORATORY',
      llmTone = 'BRANDABLE',
      llmMaxTokens = 1000,
      llmTimeout = 10000,
    } = request.body as {
      maxDepth?: number;
      maxNodes?: number;
      strategies?: ExpansionStrategy[];
      enablePrefixes?: boolean;
      enableSuffixes?: boolean;
      enableLLM?: boolean;
      llmTopN?: number;
      llmMode?: 'SAFE' | 'EXPLORATORY' | 'ADVENTUROUS';
      llmTone?: 'TECHNICAL' | 'BRANDABLE' | 'PLAYFUL' | 'PROFESSIONAL' | 'MODERN';
      llmMaxTokens?: number;
      llmTimeout?: number;
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
        payload: {
          maxDepth,
          maxNodes,
          strategies,
          enableLLM,
          llmTopN,
          llmMode,
          llmTone,
        },
        success: true,
      });

      // Run expansion with hybrid options
      const result = await expander.expand(project.initial_phrase, {
        maxDepth,
        maxNodes,
        deterministicStrategies: strategies,
        enablePrefixes,
        enableSuffixes,
        enableLLM,
        llmTopN,
        llmMode: llmMode as any,
        llmTone: llmTone as any,
        llmMaxTokens,
        llmTimeout,
      });

      // Extract confidence scores from metadata
      const confidenceScores = (result.metadata?.confidenceScores || {}) as Record<
        string,
        number
      >;

      // Save graph nodes
      const nodeRecords = result.nodes.map((value, index) => ({
        id: randomUUID(),
        project_id: projectId,
        node_type: index === 0 ? 'phrase' : 'word',
        value,
        normalized_value: value.toLowerCase(),
        semantic_weight: confidenceScores[value] || 0.5,
        depth_level: 0, // TODO: Track actual depth from expansion
        is_terminal: false,
        metadata: confidenceScores[value]
          ? { llmConfidence: confidenceScores[value], source: 'llm_enriched' }
          : { source: 'deterministic' },
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
          deterministicNodes: result.metadata?.totalNodes || 0,
          llmEnrichedNodes: result.metadata?.llmEnrichedNodes || 0,
          llmEnabled: result.metadata?.llmEnabled || false,
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

      // Get graph nodes with metadata
      const { data: nodes, error: nodesError } = await supabase
        .from('graph_nodes')
        .select('value, metadata')
        .eq('project_id', projectId);

      if (nodesError) {
        return reply.status(500).send({ error: nodesError.message });
      }

      if (!nodes || nodes.length === 0) {
        return reply.status(400).send({ error: 'No nodes found. Run expansion first.' });
      }

      // Build confidence map from node metadata
      const confidenceMap = new Map<string, number>();
      for (const node of nodes) {
        if (node.metadata?.llmConfidence) {
          confidenceMap.set(node.value, node.metadata.llmConfidence);
        }
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

      // Score candidates with confidence weighting
      const { DomainScorer } = await import('@dotcomseekr/engine');
      const scorer = new DomainScorer();

      const scoredCandidates = candidates.map((domain) => {
        // Use scoreWithConfidence if we have confidence data
        const scores =
          confidenceMap.size > 0
            ? scorer.scoreWithConfidence(domain, project.initial_phrase, confidenceMap)
            : scorer.score(domain, project.initial_phrase);

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
          scoring_metadata:
            confidenceMap.size > 0
              ? { confidenceWeighted: true, confidenceNodes: confidenceMap.size }
              : {},
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
