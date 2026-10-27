-- Quality accounting. Existing rows keep NULL for these new measurements;
-- the report separates the pre-quality trial from the quality rerun.
ALTER TABLE generation_attempts ADD COLUMN accepted_count INTEGER;
ALTER TABLE generation_attempts ADD COLUMN lexical_calls INTEGER;
ALTER TABLE generation_attempts ADD COLUMN lexical_cache_hits INTEGER;
ALTER TABLE generation_attempts ADD COLUMN lexical_latency_ms INTEGER;
ALTER TABLE generation_attempts ADD COLUMN lexical_cost_usd REAL;

-- The dictionary cache is keyed by SHA-256(term), so it does not accumulate a
-- plaintext list of brand words. The source and licence are kept with each row
-- so cached answers remain attributable.
CREATE TABLE IF NOT EXISTS lexical_cache (
  term_hash TEXT PRIMARY KEY,
  recognized INTEGER NOT NULL CHECK (recognized IN (0, 1)),
  source TEXT NOT NULL,
  license TEXT NOT NULL,
  http_status INTEGER,
  fetched_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lexical_cache_fetched_at
  ON lexical_cache (fetched_at);
