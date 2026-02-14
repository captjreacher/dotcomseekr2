# DotcomSeekr 2.0

A pure SaaS Domain Intelligence Engine powered by semantic graph traversal and hybrid AI.

## Architecture

- **Frontend**: React + Vite + TypeScript
- **Backend**: Node + Fastify + TypeScript
- **Database**: Supabase (Postgres + Auth)
- **Engine**: Deterministic lexicon expansion + LLM enrichment

## Project Structure

```
dotcomseekr2/
├── apps/
│   ├── web/          # React frontend
│   └── api/          # Fastify backend
├── packages/
│   ├── engine/       # Domain intelligence engine
│   └── shared/       # Shared types and utilities
├── lexicon/          # Local JSON lexicon files
└── supabase/         # Database migrations
```

## Getting Started

```bash
# Install dependencies
npm install

# Run development servers
npm run dev

# Build for production
npm run build
```

## Development

- Frontend: http://localhost:5173
- Backend: http://localhost:3000
