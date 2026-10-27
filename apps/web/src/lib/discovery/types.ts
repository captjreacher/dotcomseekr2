// Shared vocabulary for the guided discovery journey.
//
// These modules are imported by the browser app *and* by the discovery edge
// function (see supabase/functions/_shared/discovery.ts), so they stay pure:
// no DOM, no React, no provider credentials. Keeping one definition of a
// technique and one variation validator is what stops the client and the
// server from disagreeing about what a valid suggestion is.

export type DiscoveryMode = 'word' | 'phrase';

export type Technique = 'synonyms' | 'rhymes' | 'affixes' | 'possessives' | 'hyphens';

/** Truthful availability states. `unknown` is never rendered as available or taken. */
export type CheckStatus = 'available' | 'premium' | 'taken' | 'unknown';

export interface BrandContext {
  mode: DiscoveryMode;
  /** What the user typed, preserved exactly (trimmed, case kept). */
  original: string;
  /** The name the current round explores. Starts as the original; changes only on request. */
  workingName: string;
  /** Selected dictionary definition or the user's own description. */
  meaning: string;
  /** Attributable source of the meaning, or null when the user wrote it. */
  meaningSource: string | null;
  commentary: string;
  /** Selected extensions without dots. Never auto-filled. */
  extensions: string[];
}

export interface Variation {
  spelling: string;
  reason: string;
  /** For phrases: the word being replaced or modified. */
  changedWord?: string;
}

export interface RejectedVariation {
  value: string;
  reason: string;
}

export interface CheckResult {
  domain: string;
  status: CheckStatus;
  verified: boolean;
  price: number | null;
  currency: string;
  checkedAt: string | null;
  registrationUrl: string | null;
  reason?: string;
}

export interface ShortlistEntry {
  domain: string;
  status: Extract<CheckStatus, 'available' | 'premium'>;
  price: number | null;
  currency: string;
  /** Provider-reported check time, kept for provenance. */
  checkedAt: string | null;
  registrationUrl: string | null;
  /** Why this name was suggested in the round that produced it. */
  reason: string;
  technique: Technique;
  savedAt: string;
}
