# Supabase Database

This directory contains database migrations and configuration for DotcomSeekr.

## Setup

1. **Install Supabase CLI** (optional for local development):
   ```bash
   npm install -g supabase
   ```

2. **Start local Supabase** (optional):
   ```bash
   supabase start
   ```

3. **Apply migrations** to your Supabase project:
   - Go to Supabase Dashboard → SQL Editor
   - Run the SQL from `migrations/001_initial_schema.sql`

## Database Schema

- **users**: User accounts (extends Supabase auth.users)
- **projects**: User projects with initial phrase and settings
- **graph_nodes**: Semantic graph nodes (words, phrases, concepts)
- **graph_edges**: Relationships between nodes (synonyms, related, etc.)
- **candidates**: Generated domain name candidates with scores
- **events**: Journey event log for analytics and replay

## Row Level Security (RLS)

All tables have RLS enabled. Users can only access their own data through project ownership.
