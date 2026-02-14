-- ============================================
-- DotcomSeekr Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS
-- ============================================
-- Extends Supabase auth.users
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  stripe_customer_id TEXT UNIQUE,
  subscription_status TEXT DEFAULT 'free' CHECK (subscription_status IN ('free', 'pro', 'enterprise')),
  subscription_expires_at TIMESTAMPTZ,
  credits_remaining INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROJECTS
-- ============================================
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  initial_phrase TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_user_id ON public.projects(user_id);
CREATE INDEX idx_projects_status ON public.projects(status);

-- ============================================
-- GRAPH_NODES
-- ============================================
CREATE TABLE public.graph_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Node identity
  node_type TEXT NOT NULL CHECK (node_type IN ('phrase', 'word', 'synonym', 'related', 'enriched')),
  value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,

  -- Semantic data
  semantic_category TEXT,
  semantic_weight DECIMAL(5,4) DEFAULT 0.5,
  llm_enrichment JSONB,

  -- Metadata
  depth_level INTEGER DEFAULT 0,
  is_terminal BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_graph_nodes_project_id ON public.graph_nodes(project_id);
CREATE INDEX idx_graph_nodes_type ON public.graph_nodes(node_type);
CREATE INDEX idx_graph_nodes_normalized ON public.graph_nodes(normalized_value);
CREATE INDEX idx_graph_nodes_depth ON public.graph_nodes(depth_level);

-- ============================================
-- GRAPH_EDGES
-- ============================================
CREATE TABLE public.graph_edges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Edge connection
  source_node_id UUID NOT NULL REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES public.graph_nodes(id) ON DELETE CASCADE,

  -- Edge semantics
  edge_type TEXT NOT NULL CHECK (edge_type IN ('synonym', 'antonym', 'related', 'derived', 'enriched')),
  weight DECIMAL(5,4) DEFAULT 0.5,

  -- Provenance
  source_system TEXT NOT NULL CHECK (source_system IN ('lexicon', 'llm', 'user')),
  source_confidence DECIMAL(5,4) DEFAULT 0.5,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(source_node_id, target_node_id, edge_type)
);

CREATE INDEX idx_graph_edges_project_id ON public.graph_edges(project_id);
CREATE INDEX idx_graph_edges_source ON public.graph_edges(source_node_id);
CREATE INDEX idx_graph_edges_target ON public.graph_edges(target_node_id);
CREATE INDEX idx_graph_edges_type ON public.graph_edges(edge_type);

-- ============================================
-- CANDIDATES
-- ============================================
CREATE TABLE public.candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Domain identity
  domain_name TEXT NOT NULL,
  tld TEXT DEFAULT 'com',

  -- Composition
  source_node_ids UUID[] NOT NULL,
  recombination_strategy TEXT NOT NULL,

  -- Scoring
  score_total DECIMAL(5,2) NOT NULL,
  score_pronounceability DECIMAL(5,2),
  score_brandability DECIMAL(5,2),
  score_semantic_fit DECIMAL(5,2),
  score_technical_quality DECIMAL(5,2),
  scoring_metadata JSONB DEFAULT '{}',

  -- Grouping
  group_id UUID,
  group_label TEXT,

  -- Availability
  availability_status TEXT CHECK (availability_status IN ('available', 'taken', 'unknown', 'premium')),
  availability_checked_at TIMESTAMPTZ,
  registration_price_cents INTEGER,

  -- User interaction
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  user_favorited BOOLEAN DEFAULT FALSE,
  user_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_candidates_project_id ON public.candidates(project_id);
CREATE INDEX idx_candidates_score ON public.candidates(score_total DESC);
CREATE INDEX idx_candidates_group ON public.candidates(group_id);
CREATE INDEX idx_candidates_availability ON public.candidates(availability_status);
CREATE INDEX idx_candidates_favorited ON public.candidates(user_favorited);

-- ============================================
-- EVENTS (Journey Log)
-- ============================================
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Event identity
  event_type TEXT NOT NULL CHECK (event_type IN (
    'project_created',
    'expansion_started',
    'expansion_completed',
    'llm_enrichment_started',
    'llm_enrichment_completed',
    'graph_traversal',
    'recombination_run',
    'candidates_generated',
    'candidates_scored',
    'candidates_grouped',
    'branch_expanded',
    'user_feedback',
    'availability_checked'
  )),

  -- Event data
  payload JSONB NOT NULL DEFAULT '{}',

  -- Metadata
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  duration_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_project_id ON public.events(project_id);
CREATE INDEX idx_events_user_id ON public.events(user_id);
CREATE INDEX idx_events_type ON public.events(event_type);
CREATE INDEX idx_events_created_at ON public.events(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Users: can only see/update their own record
CREATE POLICY users_select ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY users_update ON public.users FOR UPDATE USING (auth.uid() = id);

-- Projects: users own their projects
CREATE POLICY projects_select ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY projects_insert ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY projects_update ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY projects_delete ON public.projects FOR DELETE USING (auth.uid() = user_id);

-- Graph nodes: accessible via project ownership
CREATE POLICY graph_nodes_select ON public.graph_nodes FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = graph_nodes.project_id AND projects.user_id = auth.uid()));
CREATE POLICY graph_nodes_insert ON public.graph_nodes FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = graph_nodes.project_id AND projects.user_id = auth.uid()));

-- Graph edges: accessible via project ownership
CREATE POLICY graph_edges_select ON public.graph_edges FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = graph_edges.project_id AND projects.user_id = auth.uid()));
CREATE POLICY graph_edges_insert ON public.graph_edges FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = graph_edges.project_id AND projects.user_id = auth.uid()));

-- Candidates: accessible via project ownership
CREATE POLICY candidates_select ON public.candidates FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = candidates.project_id AND projects.user_id = auth.uid()));
CREATE POLICY candidates_insert ON public.candidates FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = candidates.project_id AND projects.user_id = auth.uid()));
CREATE POLICY candidates_update ON public.candidates FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = candidates.project_id AND projects.user_id = auth.uid()));

-- Events: accessible via project ownership
CREATE POLICY events_select ON public.events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = events.project_id AND projects.user_id = auth.uid()));
CREATE POLICY events_insert ON public.events FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = events.project_id AND projects.user_id = auth.uid()));

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
