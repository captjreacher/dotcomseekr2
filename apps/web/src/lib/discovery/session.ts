// Session state for one guided discovery journey.
//
// The original brand input, the chosen meaning, the commentary and the selected
// extensions are the anchor for every round. They live in a plain object so the
// same shape can be persisted to sessionStorage and restored after a refresh
// within the same browser tab, without a login.
import type {
  BrandContext,
  CheckResult,
  RejectedVariation,
  ShortlistEntry,
  Technique,
  Variation,
} from './types.ts';

export const SESSION_STORAGE_KEY = 'dotcomseekr:discovery:v1';

export interface RoundState {
  technique: Technique;
  workingName: string;
  variations: Variation[];
  rejected: RejectedVariation[];
  /** Availability answers keyed by domain, only for names the user checked. */
  checked: Record<string, CheckResult>;
  /** 1-based round number within the session. */
  round: number;
}

export interface DiscoverySession {
  brand: BrandContext | null;
  workingName: string;
  technique: Technique | null;
  round: RoundState | null;
  shortlist: ShortlistEntry[];
  /** Every spelling already proposed, so later rounds cannot repeat it. */
  seen: string[];
  updatedAt: string;
}

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function emptySession(): DiscoverySession {
  return {
    brand: null,
    workingName: '',
    technique: null,
    round: null,
    shortlist: [],
    seen: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadSession(storage?: SessionStorageLike | null): DiscoverySession {
  if (!storage) return emptySession();

  try {
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return emptySession();

    const parsed = JSON.parse(raw) as Partial<DiscoverySession>;

    return {
      brand: parsed.brand ?? null,
      workingName: typeof parsed.workingName === 'string' ? parsed.workingName : '',
      technique: parsed.technique ?? null,
      round: parsed.round ?? null,
      shortlist: Array.isArray(parsed.shortlist) ? parsed.shortlist : [],
      seen: Array.isArray(parsed.seen) ? parsed.seen : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return emptySession();
  }
}

export function saveSession(
  session: DiscoverySession,
  storage?: SessionStorageLike | null
): DiscoverySession {
  const next = { ...session, updatedAt: new Date().toISOString() };

  try {
    storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, quota). The journey still works.
  }

  return next;
}

/** Establish the brand. A later edit of meaning/commentary never silently re-anchors. */
export function withBrand(session: DiscoverySession, brand: BrandContext): DiscoverySession {
  const anchor = session.brand?.workingName ?? '';
  const keepWorkingName = Boolean(anchor) && session.workingName !== '';

  return {
    ...session,
    brand,
    workingName: keepWorkingName ? session.workingName : brand.original,
  };
}

/** Change the working name explicitly (the original anchor stays in `brand`). */
export function withWorkingName(session: DiscoverySession, workingName: string): DiscoverySession {
  return { ...session, workingName, round: null, seen: [] };
}

export function withTechnique(session: DiscoverySession, technique: Technique): DiscoverySession {
  return { ...session, technique };
}

export function withRound(session: DiscoverySession, round: RoundState): DiscoverySession {
  const seen = [
    ...new Set([...session.seen, ...round.variations.map((variation) => variation.spelling)]),
  ];

  return { ...session, round, seen };
}

export function withCheckedResults(
  session: DiscoverySession,
  results: readonly CheckResult[]
): DiscoverySession {
  if (!session.round) return session;

  const checked = { ...session.round.checked };
  for (const result of results) checked[result.domain] = result;

  return { ...session, round: { ...session.round, checked } };
}

/** Save a purchasable name. Saving the same domain twice keeps one entry. */
export function addToShortlist(session: DiscoverySession, entry: ShortlistEntry): DiscoverySession {
  if (entry.status !== 'available' && entry.status !== 'premium') return session;

  const existing = session.shortlist.find((item) => item.domain === entry.domain);

  if (existing) {
    const updated: ShortlistEntry = {
      ...entry,
      savedAt: existing.savedAt,
    };

    return {
      ...session,
      shortlist: session.shortlist.map((item) => (item.domain === entry.domain ? updated : item)),
    };
  }

  return { ...session, shortlist: [...session.shortlist, entry] };
}

export function removeFromShortlist(session: DiscoverySession, domain: string): DiscoverySession {
  return { ...session, shortlist: session.shortlist.filter((item) => item.domain !== domain) };
}

export function isSaved(session: DiscoverySession, domain: string): boolean {
  return session.shortlist.some((item) => item.domain === domain);
}

/** Round number to display: the round in progress, or the next one. */
export function roundNumber(session: DiscoverySession): number {
  return (session.round?.round ?? 0) + 1;
}
