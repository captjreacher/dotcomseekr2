// Minimal Cloudflare bindings used by the trial worker.
//
// The worker deliberately keeps its own narrow interfaces instead of adding a
// workers-types dependency to this repository: the trial must be removable
// without touching the application's dependency graph.

export interface AiBinding {
  run(
    model: string,
    input: Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ): Promise<unknown>;
}

export interface D1Result<T = unknown> {
  success: boolean;
  results?: T[];
  meta?: { changes?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface Env {
  AI?: AiBinding;
  USAGE_DB?: D1Database;

  /** Cloudflare secret: comma-separated SHA-256 hashes of tester access codes. */
  TRIAL_KEY_HASHES?: string;

  /** Optional overrides; defaults keep the trial on Workers AI. */
  TRIAL_PROVIDER?: string;
  TRIAL_MODEL?: string;
  TRIAL_ALLOWED_ORIGINS?: string;

  TRIAL_SESSION_TURNS_PER_DAY?: string;
  TRIAL_SESSION_CALLS_PER_DAY?: string;
  TRIAL_GLOBAL_TURNS_PER_DAY?: string;
  TRIAL_GLOBAL_CALLS_PER_DAY?: string;
  TRIAL_TOTAL_TURNS?: string;
  TRIAL_TOTAL_CALLS?: string;
  TRIAL_TOTAL_TOKENS?: string;
}
