/**
 * Bounded JSON requests.
 *
 * Every request has a hard deadline. A timeout aborts the underlying fetch and
 * rejects with `kind: 'timeout'`, so a caller's loading state can always clear.
 * An external `AbortSignal` lets a newer search cancel a superseded one, and a
 * late response can never resolve a request that already timed out or aborted.
 */

export type RequestFailureKind = 'timeout' | 'network' | 'http' | 'invalid' | 'aborted';

export class RequestError extends Error {
  readonly kind: RequestFailureKind;
  readonly status?: number;

  constructor(kind: RequestFailureKind, message: string, status?: number) {
    super(message);
    this.name = 'RequestError';
    this.kind = kind;
    this.status = status;
  }
}

/** Default deadline for ordinary JSON calls. */
export const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Deadline for a domain search. Live availability checks regularly take around
 * 50 seconds, so this leaves headroom while still bounding a stalled provider.
 */
export const DOMAIN_SEARCH_TIMEOUT_MS = 75_000;

export interface RequestJsonOptions extends Omit<RequestInit, 'signal'> {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function isRequestAborted(error: unknown): boolean {
  return error instanceof RequestError && error.kind === 'aborted';
}

export function isRequestTimeout(error: unknown): boolean {
  return error instanceof RequestError && error.kind === 'timeout';
}

function timeoutError(timeoutMs: number) {
  return new RequestError(
    'timeout',
    `This took longer than ${Math.round(timeoutMs / 1000)} seconds, so we stopped waiting. Please try again.`
  );
}

function abortedError() {
  return new RequestError('aborted', 'Request cancelled.');
}

export async function requestJson<T>(
  url: string,
  options: RequestJsonOptions = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal, ...init } = options;
  const controller = new AbortController();
  let timedOut = false;
  let rejectCancellation!: (error: RequestError) => void;
  const cancellation = new Promise<never>((_resolve, reject) => {
    rejectCancellation = reject;
  });
  // The pending cancellation promise can reject before a race attaches to it;
  // keep that from surfacing as an unhandled rejection.
  void cancellation.catch(() => undefined);

  const abortFromExternal = () => {
    controller.abort();
    rejectCancellation(abortedError());
  };

  if (externalSignal?.aborted) {
    abortFromExternal();
  } else {
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectCancellation(timeoutError(timeoutMs));
  }, timeoutMs);

  const guardCancellation = () => {
    if (timedOut) throw timeoutError(timeoutMs);
    if (externalSignal?.aborted) throw abortedError();
  };

  try {
    guardCancellation();

    // Race the deadline so a fetch implementation that ignores the abort signal
    // still cannot keep the caller waiting for a late response.
    const response = await Promise.race([
      fetch(url, { ...init, signal: controller.signal }),
      cancellation,
    ]);
    guardCancellation();

    if (!response.ok) {
      let message = response.statusText || `Request failed with status ${response.status}`;

      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body?.error === 'string' && body.error.trim()) {
          message = body.error;
        }
      } catch {
        // Keep the status text when the error body is not JSON.
      }

      throw new RequestError('http', message, response.status);
    }

    let body: T;
    try {
      body = (await Promise.race([response.json(), cancellation])) as T;
    } catch (error) {
      guardCancellation();
      if (error instanceof RequestError) throw error;
      throw new RequestError(
        'invalid',
        'We could not read the response from the naming service. Please try again.'
      );
    }

    guardCancellation();
    return body;
  } catch (error) {
    if (timedOut) throw timeoutError(timeoutMs);
    if (externalSignal?.aborted) throw abortedError();
    if (error instanceof RequestError) throw error;

    throw new RequestError(
      'network',
      'We could not reach the naming service. Check your connection and try again.'
    );
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}
