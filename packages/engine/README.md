# @dotcomseekr/engine

Core domain intelligence engine for DotcomSeekr.

## Architecture

The engine is organized into modular components:

### 1. Expander
- `DeterministicExpander`: Expands phrases using local JSON lexicons
- `LexiconLoader`: Loads and caches lexicon files
- `PhraseSplitter`: Splits phrases into meaningful tokens

### 2. Enricher
- `LLMEnricher`: Enriches expansion with Claude API
- `SemanticAnalyzer`: Analyzes semantic relationships

### 3. Graph
- `GraphBuilder`: Constructs semantic graphs
- `GraphTraverser`: Traverses graphs (DFS/BFS)
- `NodeManager`: CRUD operations for nodes

### 4. Recombiner
- `Recombiner`: Generates domain name candidates
- Strategies: Linear, Semantic, Weighted

### 5. Scorer
- `DomainScorer`: Scores domain quality
- Metrics: Pronounceability, Brandability, Semantic Fit, Technical Quality

### 6. Grouper
- `CandidateGrouper`: Groups similar candidates

### 7. Persistence
- `GraphPersister`: Saves/loads graphs to database
- `JourneyPersister`: Saves expansion journey
- `EventLogger`: Logs engine events

### 8. Registry
- `IRegistrationProvider`: Interface for domain registration
- `MockRegistrationProvider`: Mock implementation for v1

## Usage

```typescript
import { DeterministicExpander, LLMEnricher, GraphBuilder } from '@dotcomseekr/engine';

// Expand phrase
const expander = new DeterministicExpander('/path/to/lexicons');
const result = await expander.expand('cloud sync', 2);

// Enrich with LLM
const enricher = new LLMEnricher(process.env.ANTHROPIC_API_KEY);
const enriched = await enricher.enrich(result.nodes, 'SaaS product');

// Build graph
const builder = new GraphBuilder();
const graph = builder.buildGraph(enriched.nodes, enriched.edges);
```

## Development Status

All modules are currently skeleton implementations with interfaces and TODOs.
Full implementation will be added in subsequent commits.
