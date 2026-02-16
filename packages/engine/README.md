# @dotcomseekr/engine

Core domain intelligence engine for DotcomSeekr.

## Architecture

The engine is organized into modular components:

### 1. Expander
- `DeterministicExpander`: Expands phrases using local JSON lexicons with 6 strategies:
  - SYNONYM: Direct synonym lookup
  - RELATED: Semantically related words
  - RHYME: Phonetic rhymes
  - PHONETIC_NEIGHBOR: Similar-sounding words
  - MORPHOLOGICAL: Prefix/suffix transformations
  - ALLITERATIVE: Same-letter words
- `HybridExpander`: Combines deterministic expansion with LLM enrichment
- `LexiconLoader`: Loads and caches lexicon files
- `PhraseSplitter`: Splits phrases into meaningful tokens

### 2. Enricher
- `LLMEnricher`: Enriches expansion with Claude API
  - Supports exploration modes: SAFE, EXPLORATORY, ADVENTUROUS
  - Supports tone modifiers: TECHNICAL, BRANDABLE, PLAYFUL, PROFESSIONAL, MODERN
  - In-memory caching with token+tone keys
  - Timeout protection and fail-safe fallback
- `SemanticAnalyzer`: Analyzes semantic relationships

### 3. Graph
- `GraphBuilder`: Constructs semantic graphs
- `GraphTraverser`: Traverses graphs (DFS/BFS)
- `NodeManager`: CRUD operations for nodes

### 4. Recombiner
- `Recombiner`: Generates domain name candidates
- Strategies: Linear, Semantic, Weighted

### 5. Scorer
- `DomainScorer`: Scores domain quality with weighted metrics
  - Pronounceability (25%): Vowel/consonant balance, phonetic patterns
  - Brandability (35%): Memorability, distinctiveness
  - Semantic Fit (25%): Relevance to original phrase
  - Technical Quality (15%): Length, hyphens, numbers
  - Optional confidence weighting: ±5 points based on LLM confidence scores

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

### Deterministic Expansion Only

```typescript
import { DeterministicExpander, ExpansionStrategy } from '@dotcomseekr/engine';

const expander = new DeterministicExpander('/path/to/lexicons');
await expander.initialize();

const result = await expander.expandWithOptions('cloud sync', {
  maxDepth: 2,
  maxNodes: 500,
  strategies: [ExpansionStrategy.SYNONYM, ExpansionStrategy.RELATED],
  enablePrefixes: true,
  enableSuffixes: true,
});

console.log(`Generated ${result.nodes.length} nodes`);
```

### Hybrid Expansion (Deterministic + LLM)

```typescript
import {
  HybridExpander,
  ExplorationMode,
  ToneModifier
} from '@dotcomseekr/engine';

const expander = new HybridExpander(
  '/path/to/lexicons',
  process.env.ANTHROPIC_API_KEY
);
await expander.initialize();

const result = await expander.expand('cloud sync', {
  maxDepth: 2,
  maxNodes: 500,
  enableLLM: true,
  llmTopN: 10, // Enrich top 10 scored nodes
  llmMode: ExplorationMode.EXPLORATORY,
  llmTone: ToneModifier.BRANDABLE,
  llmMaxTokens: 1000,
  llmTimeout: 10000,
});

// Access LLM metadata
console.log(`LLM enriched ${result.metadata?.llmEnrichedNodes} nodes`);
console.log('Confidence scores:', result.metadata?.confidenceScores);
```

### Recombination and Scoring

```typescript
import { Recombiner, DomainScorer } from '@dotcomseekr/engine';

// Generate domain candidates
const recombiner = new Recombiner();
const candidates = recombiner.recombineWithOptions(result.nodes, {
  maxLength: 20,
  minLength: 5,
  maxCandidates: 500,
  allowHyphens: false,
  allowNumbers: false,
});

// Score with confidence weighting
const scorer = new DomainScorer();
const confidenceMap = new Map(
  Object.entries(result.metadata?.confidenceScores || {})
);

const scored = candidates.map(domain => ({
  domain,
  scores: scorer.scoreWithConfidence(domain, 'cloud sync', confidenceMap)
}));

// Sort by total score
scored.sort((a, b) => b.scores.total - a.scores.total);
console.log('Top domain:', scored[0].domain, scored[0].scores.total);
```

## Configuration

### Environment Variables

- `ANTHROPIC_API_KEY`: Required for LLM enrichment (optional, falls back to deterministic-only)

### Exploration Modes

- **SAFE**: Conservative expansions, stays close to seed tokens
- **EXPLORATORY**: Balanced creativity and relevance (default)
- **ADVENTUROUS**: Maximum creativity, more distant semantic connections

### Tone Modifiers

- **TECHNICAL**: Technical/engineering-oriented terms
- **BRANDABLE**: Catchy, memorable, marketing-friendly (default)
- **PLAYFUL**: Fun, casual, approachable
- **PROFESSIONAL**: Formal, business-oriented
- **MODERN**: Contemporary, trendy terms

## Performance Guardrails

- **Top-N enrichment**: Only enriches highest-scored nodes to control API costs
- **Timeout protection**: Configurable timeout per LLM call (default 10s)
- **Fail-safe fallback**: Returns deterministic results on LLM failures
- **In-memory caching**: Caches LLM responses by token+tone key
- **Node/depth limits**: Hard caps on expansion size

## Testing

```bash
# Run unit tests
npm test

# Run integration tests (requires ANTHROPIC_API_KEY for LLM tests)
npm test -- hybrid-expansion.test.ts
```
