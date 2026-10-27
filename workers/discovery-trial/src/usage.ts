// Per-attempt usage accounting.
//
// One row is one provider call. A failed first attempt and its retry are two
// rows sharing a turn_id, so retries are included in the turn's cost rather
// than hidden. Brand commentary, brand input and credentials are never written
// here; the row carries only the technique, tokens, outcome and timing.
import type { D1Database } from './types.ts';
import { PRICING_DATE, PRICING_SOURCE, estimateUsage } from './pricing.ts';

export type AttemptOutcome =
  | 'success'
  | 'validation_rejected'
  | 'provider_error'
  | 'accounting_error';

export interface AttemptRecord {
  turnId: string;
  sessionRef: string;
  technique: string;
  mode: string;
  provider: string;
  model: string;
  attempt: number;
  outcome: AttemptOutcome;
  httpStatus: number | null;
  errorCode: string | null;
  providerStatus: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  billedUnits: number | null;
  billedUnitName: string | null;
  latencyMs: number;
  rejectedCount: number | null;
  acceptedCount: number | null;
  /** Independent dictionary calls for this turn; zero when no lexical check ran. */
  lexicalCalls: number | null;
  lexicalCacheHits: number | null;
  lexicalLatencyMs: number | null;
  lexicalCostUsd: number | null;
}

/** Persist one provider attempt. Throws so the caller can fail closed. */
export async function recordAttempt(db: D1Database, record: AttemptRecord): Promise<void> {
  const estimate = estimateUsage(record.model, record.inputTokens, record.outputTokens);

  await db
    .prepare(
      `INSERT INTO generation_attempts (
         created_at, turn_id, session_ref, technique, mode,
         provider, model, attempt, outcome, http_status, error_code, provider_status,
         input_tokens, output_tokens, total_tokens, billed_units, billed_unit_name,
         estimated_cost_usd, estimated_neurons, pricing_source, pricing_date,
         latency_ms, rejected_count, accepted_count,
         lexical_calls, lexical_cache_hits, lexical_latency_ms, lexical_cost_usd
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      new Date().toISOString(),
      record.turnId,
      record.sessionRef,
      record.technique,
      record.mode,
      record.provider,
      record.model,
      record.attempt,
      record.outcome,
      record.httpStatus,
      record.errorCode,
      record.providerStatus,
      record.inputTokens,
      record.outputTokens,
      record.totalTokens,
      record.billedUnits,
      record.billedUnitName,
      estimate.estimatedCostUsd,
      estimate.estimatedNeurons,
      PRICING_SOURCE,
      PRICING_DATE,
      record.latencyMs,
      record.rejectedCount,
      record.acceptedCount,
      record.lexicalCalls,
      record.lexicalCacheHits,
      record.lexicalLatencyMs,
      record.lexicalCostUsd
    )
    .run();
}

/** Number of provider calls made for one user turn, including retries. */
export async function countTurnCalls(db: D1Database, turnId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS calls FROM generation_attempts WHERE turn_id = ?')
    .bind(turnId)
    .first<{ calls: number }>();

  return Number(row?.calls ?? 0);
}
