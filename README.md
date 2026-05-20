# DotcomSeekr

A Domain Intelligence Engine that uses semantic graph traversal and hybrid AI enrichment to discover brandable domain names.

## Architecture

DotcomSeekr is a full-stack monorepo combining deterministic lexicon expansion with LLM-powered semantic enrichment:

- **Frontend**: React + Vite + TypeScript
- **Backend**: Node + Fastify + TypeScript
- **Database**: Supabase (Postgres + Auth)
- **Engine**: Hybrid expansion (Deterministic + Claude AI)
- **Monorepo**: npm workspaces

## Features

### Core Intelligence Engine

- **6 Deterministic Expansion Strategies**
  - SYNONYM: Direct synonym lookup
  - RELATED: Semantically related words
  - RHYME: Phonetic rhymes
  - PHONETIC_NEIGHBOR: Similar-sounding words
  - MORPHOLOGICAL: Prefix/suffix transformations
  - ALLITERATIVE: Same-letter words

- **LLM Enrichment (Optional)**
  - Runs only on top-N scored nodes to control costs
  - 3 exploration modes: SAFE, EXPLORATORY, ADVENTUROUS
  - 5 tone modifiers: TECHNICAL, BRANDABLE, PLAYFUL, PROFESSIONAL, MODERN
  - In-memory caching with token+tone keys
  - Timeout protection and fail-safe fallback

- **Intelligent Scoring**
  - Pronounceability (25%): Vowel/consonant balance, phonetic patterns
  - Brandability (35%): Memorability, distinctiveness
  - Semantic Fit (25%): Relevance to original phrase
  - Technical Quality (15%): Length, hyphens, numbers
  - Optional confidence weighting: ±5 points from LLM confidence

- **Mock Availability & Purchase**
  - Deterministic availability simulation (~60% available)
  - Premium domain pricing (15% of available)
  - Mock purchase flow with order tracking

### User Experience

- Create projects with custom expansion settings
- Interactive journey explorer with grouped candidates
- Token locking for focused exploration
- Branch expansion for semantic exploration
- Real-time availability checking
- Mock domain purchase

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Supabase account (free tier works)
- Anthropic API key (optional, for LLM enrichment)

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd dotcomseekr2
npm install
```

### 2. Configure Environment

#### API Configuration

```bash
cd apps/api
cp .env.example .env
```

Edit `apps/api/.env`:

```bash
# API
PORT=3000
FRONTEND_URL=http://localhost:5173

# Supabase (get from https://supabase.com/dashboard)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic Claude (optional - for LLM enrichment)
ANTHROPIC_API_KEY=sk-ant-your-api-key
```

#### Web Configuration

```bash
cd apps/web
cp .env.example .env
```

Edit `apps/web/.env`:

```bash
VITE_API_URL=http://localhost:3000
```

### 3. Setup Database

#### Option A: Supabase Cloud (Recommended)

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor
3. Run migrations in order:
   ```bash
   # Copy content of supabase/migrations/001_initial_schema.sql
   # Paste and execute in SQL Editor

   # Copy content of supabase/migrations/002_add_orders_table.sql
   # Paste and execute in SQL Editor
   ```

#### Option B: Local Supabase

```bash
# Install Supabase CLI
npm install -g supabase

# Start local Supabase
supabase start

# Apply migrations
supabase db push
```

### 4. Build and Run

#### Development Mode

```bash
# Terminal 1: Run API
cd apps/api
npm run dev

# Terminal 2: Run Web
cd apps/web
npm run dev

# Open http://localhost:5173
```

#### Production Build

```bash
# Build all packages
npm run build

# Start API
cd apps/api
npm start

# Serve web app
cd apps/web
npm run preview
```

## Project Structure

```
dotcomseekr2/
├── apps/
│   ├── api/              # Fastify backend
│   │   ├── src/
│   │   │   ├── routes/   # API endpoints
│   │   │   ├── services/ # Database, auth
│   │   │   └── server.ts # Server setup
│   │   └── .env.example
│   └── web/              # React frontend
│       ├── src/
│       │   ├── pages/    # Route pages
│       │   ├── services/ # API client
│       │   └── App.tsx
│       └── .env.example
├── packages/
│   ├── engine/           # Core intelligence engine
│   │   ├── src/
│   │   │   ├── expander/ # Deterministic + Hybrid expansion
│   │   │   ├── enricher/ # LLM enrichment
│   │   │   ├── scorer/   # Domain scoring
│   │   │   ├── recombiner/ # Domain generation
│   │   │   └── registry/ # Availability checking
│   │   └── README.md     # Engine documentation
│   └── shared/           # Shared types
├── lexicon/              # Expansion lexicons (JSON)
│   ├── base_synonyms.json
│   ├── base_related.json
│   ├── base_rhymes.json
│   ├── base_phonetics.json
│   ├── tone_glue.json
│   ├── stopwords.json
│   └── blocklist.json
├── supabase/
│   └── migrations/       # Database migrations
└── package.json          # Workspace root
```

## API Endpoints

### Projects
- `GET /api/v1/projects` - List projects
- `POST /api/v1/projects` - Create project
- `GET /api/v1/projects/:id` - Get project

### Expansion & Recombination
- `POST /api/v1/projects/:id/expand` - Expand phrase
- `POST /api/v1/projects/:id/recombine` - Generate domains
- `GET /api/v1/projects/:id/graph` - Get semantic graph
- `GET /api/v1/projects/:id/candidates` - Get scored candidates

### Availability & Orders
- `GET /api/v1/availability/:domain` - Check single domain
- `POST /api/v1/projects/:id/check-availability` - Batch check
- `POST /api/v1/orders` - Create order (mock purchase)
- `GET /api/v1/projects/:id/orders` - Get orders
- `POST /api/v1/orders/:id/cancel` - Cancel order

### Health
- `GET /health` - Health check
- `GET /health/db` - Database health

## Usage Example

### 1. Create Project

```typescript
const project = await api.createProject({
  name: 'Cloud Sync Product',
  description: 'Finding a domain for our sync platform',
  initialPhrase: 'cloud sync data',
});
```

### 2. Expand with LLM Enrichment

```typescript
await api.expand(project.id, {
  maxDepth: 2,
  maxNodes: 500,
  enableLLM: true,
  llmTopN: 10,
  llmMode: 'EXPLORATORY',
  llmTone: 'BRANDABLE',
});
```

### 3. Generate & Score Candidates

```typescript
await api.recombine(project.id, {
  maxLength: 15,
  maxCandidates: 500,
});

const candidates = await api.getCandidates(project.id, 70); // Min score 70
```

### 4. Check Availability

```typescript
await api.checkProjectAvailability(project.id, { limit: 50 });

// Candidates now have availability_status: 'available', 'premium', 'taken'
```

### 5. Purchase Domain (Mock)

```typescript
const order = await api.createOrder({
  projectId: project.id,
  candidateId: candidate.id,
  domainName: candidate.domain_name,
  tld: 'com',
  priceCents: 1200, // $12.00
  isPremium: false,
});
```

## Performance Guardrails

- **Top-N LLM enrichment**: Only enriches highest-scored nodes
- **Timeout protection**: 10s default timeout per LLM call
- **Fail-safe fallback**: Returns deterministic results on LLM failures
- **In-memory caching**: Caches LLM responses by token+tone
- **Node/depth limits**: Hard caps on graph expansion size
- **Batch operations**: Efficient batch availability checking

## Testing

```bash
# Run all tests
npm test

# Run engine tests
cd packages/engine
npm test

# Run integration tests (requires ANTHROPIC_API_KEY for LLM tests)
npm test -- hybrid-expansion.test.ts
```

## Development

### Code Organization

- **apps/**: User-facing applications (API, Web)
- **packages/**: Reusable packages (Engine, Shared types)
- **lexicon/**: Static data files for deterministic expansion

### Tech Stack

- **TypeScript**: Strict typing across all packages
- **React Router**: Client-side routing
- **Fastify**: Fast, low-overhead API framework
- **Supabase**: Postgres + RLS + Auth
- **Anthropic Claude**: LLM enrichment via SDK
- **Zod**: Runtime schema validation
- **Jest**: Unit and integration testing

### Adding New Expansion Strategies

1. Add strategy to `ExpansionStrategy` enum
2. Implement in `DeterministicExpander.expandNode()`
3. Add lexicon file if needed in `/lexicon`
4. Update tests

### Adding New Scoring Metrics

1. Create metric function in `packages/engine/src/scorer/metrics/`
2. Add to `DomainScorer.score()`
3. Update `DEFAULT_WEIGHTS` if needed
4. Update tests

## Deployment

### API Deployment (Node.js)

```bash
# Build
npm run build

# Start with PM2
pm2 start apps/api/dist/index.js --name dotcomseekr-api

# Or with Docker
docker build -t dotcomseekr-api -f apps/api/Dockerfile .
docker run -p 3000:3000 --env-file apps/api/.env dotcomseekr-api
```

### Web Deployment (Static)

```bash
# Build
cd apps/web
npm run build

# Deploy dist/ to:
# - Vercel, Netlify, Cloudflare Pages
# - S3 + CloudFront
# - Any static hosting
```

### Database Deployment

- Use Supabase Cloud (recommended)
- Or self-host Supabase/Postgres
- Run migrations in order on production DB

## Roadmap

- [ ] Registrar-neutral domain registration options
- [ ] Stripe payment integration
- [ ] User authentication (Supabase Auth)
- [ ] Domain monitoring and alerts
- [ ] Bulk operations and CSV export
- [ ] Advanced filtering and search
- [ ] Team collaboration features
- [ ] API rate limiting and quotas

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

## Support

- GitHub Issues: Report bugs or request features
- Documentation: See `/packages/engine/README.md` for engine details

---

Built with ❤️ using Claude AI
