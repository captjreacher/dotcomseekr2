-- One row per provider call. Retries share a turn_id with the attempt that
-- preceded them, so a turn's true provider cost is the sum over its rows.
CREATE TABLE IF NOT EXISTS generation_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  session_ref TEXT NOT NULL,
  technique TEXT NOT NULL,
  mode TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (
    outcome IN ('success', 'validation_rejected', 'provider_error', 'accounting_error')
  ),
  http_status INTEGER,
  error_code TEXT,
  provider_status INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  billed_units REAL,
  billed_unit_name TEXT,
  estimated_cost_usd REAL,
  estimated_neurons REAL,
  pricing_source TEXT,
  pricing_date TEXT,
  latency_ms INTEGER NOT NULL,
  rejected_count INTEGER
);

CREATE INDEX IF NOT EXISTS idx_generation_attempts_session_day
  ON generation_attempts (session_ref, created_at);

CREATE INDEX IF NOT EXISTS idx_generation_attempts_created_at
  ON generation_attempts (created_at);

CREATE INDEX IF NOT EXISTS idx_generation_attempts_turn
  ON generation_attempts (turn_id);
