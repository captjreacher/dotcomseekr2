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
- `LexiconLoader`: Loads and caches lexicon files
- `PhraseSplitter`: Splits phrases into meaningful tokens

### 2. Creative Enrichment (provider-neutral)
- `ICreativeModel`: the only model surface; a concrete provider implements it.
  Vendor SDKs never leak past this boundary.
- `CreativeEnricher`: performs exactly ONE creative request per search:
  - search-level request (seed, useCase, tone, explorationMode, context)
  - real cancellation (AbortController is passed into the model and raced
    against a local deadline)
  - bounded, TTL'd, search-level cache
  - never throws; degrades to deterministic output on any failure
- `FakeCreativeModel`: hermetic test double so automated tests never hit a
  network model (any future live test opts in via `RUN_LLM_TESTS=1`)
- `mergeCandidates` / `enrichSearchCandidates`: normalize, dedupe, validate and
  score creative candidates with the deterministic rules and `DomainScorer`.
  Creative confidence only nudges the total by a bounded ±5 points.

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

### Creative Enrichment (one request per search)

```typescript
import {
  CreativeEnricher,
  ExplorationMode,
  enrichSearchCandidates,
  type ICreativeModel,
} from '@dotcomseekr/engine';

// Any provider implements ICreativeModel. Swap in a real adapter later;
// tests use a fake so the default suite never hits the network.
const model: ICreativeModel = myCreativeAdapter;

const { candidates, creative } = await enrichSearchCandidates({
  seed: 'cloud sync',
  useCase: 'developer tooling',
  tone: 'BRANDABLE',
  explorationMode: ExplorationMode.EXPLORATORY,
  model, // exactly one creative request happens here
});

console.log(`Creative degraded? ${creative.degraded}`);
console.log(`Ranked candidates: ${candidates.length}`);
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

- No model environment variables are required. The creative layer is
  provider-neutral; a concrete adapter (added in a later step) supplies its own
  credentials. Without a model, searches are deterministic-only.
- `RUN_LLM_TESTS=1`: opt-in gate for any future live-model integration test.
  The default automated suite never calls an external model.

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

- **One creative request per search**: the model explores the whole naming
  problem once, instead of one call per token.
- **Real timeout/cancellation**: an AbortController is passed into the model and
  raced against a local deadline (default 12s), so a hung model cannot block.
- **Fail-safe fallback**: any failure, timeout, malformed payload or empty
  result degrades to the deterministic candidates.
- **Bounded caching**: TTL'd, size-capped, keyed on seed/context/tone/mode.
- **Deterministic authority**: creative candidates pass through the same
  normalization, dedupe, validation and `DomainScorer`; confidence only nudges
  the total by ±5 points.

## Testing

```bash
# Run unit tests (hermetic; never calls an external model)
npm test
```
