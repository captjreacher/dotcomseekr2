// Client-side wiring for the isolated Cloudflare Workers AI trial.
//
// The trial is opt-in at build time: when VITE_DISCOVERY_TRIAL_URL is absent the
// wizard keeps calling the existing Supabase endpoint. A tester who has the URL
// still needs an access code, which lives only in this tab's sessionStorage and
// is checked server-side. No Cloudflare credential ever reaches the browser.
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY_STORAGE = 'dotcomseekr:discovery:trial-key';
const SESSION_STORAGE = 'dotcomseekr:discovery:trial-session';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function browserStorage(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function configuredTrialUrl(): string | undefined {
  try {
    return import.meta.env.VITE_DISCOVERY_TRIAL_URL;
  } catch {
    // The module is also imported by Node tests, where import.meta.env is absent.
    return undefined;
  }
}

/**
 * Resolve the trial endpoint. Plain HTTP is accepted only for loopback so a
 * tester code is never sent in clear text across a network.
 */
export function trialEndpoint(value?: string): string | null {
  const raw = value ?? configuredTrialUrl();
  if (typeof raw !== 'string' || !raw.trim()) return null;

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  const loopback =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null;

  return url.toString().replace(/\/+$/, '');
}

export function readTrialKey(storage: StorageLike | null = browserStorage()): string {
  if (!storage) return '';

  try {
    return storage.getItem(KEY_STORAGE)?.trim() ?? '';
  } catch {
    return '';
  }
}

/** Save (or clear, with an empty value) the tester code for this tab. */
export function saveTrialKey(
  value: string,
  storage: StorageLike | null = browserStorage()
): string {
  const key = value.trim();

  if (!storage) return key;

  try {
    if (key) storage.setItem(KEY_STORAGE, key);
    else storage.removeItem(KEY_STORAGE);
  } catch {
    // Private mode can reject writes; the code still works for this render.
  }

  return key;
}

export function clearTrialKey(storage: StorageLike | null = browserStorage()): void {
  if (!storage) return;

  try {
    storage.removeItem(KEY_STORAGE);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

/** One random, pseudonymous session id per browser tab. */
export function trialSessionId(
  storage: StorageLike | null = browserStorage(),
  create: () => string = () => crypto.randomUUID()
): string {
  if (storage) {
    try {
      const existing = storage.getItem(SESSION_STORAGE);
      if (existing && UUID_PATTERN.test(existing)) return existing;
    } catch {
      // Fall through and create a session for this render.
    }
  }

  const created = create();
  if (storage) {
    try {
      storage.setItem(SESSION_STORAGE, created);
    } catch {
      // The session still identifies this request.
    }
  }

  return created;
}

export function trialHeaders(
  storage: StorageLike | null = browserStorage()
): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-trial-key': readTrialKey(storage),
    'x-trial-session': trialSessionId(storage),
  };
}

/** A new id for one explicit request for a batch of naming suggestions. */
export function newTurnId(create: () => string = () => crypto.randomUUID()): string {
  return create();
}
