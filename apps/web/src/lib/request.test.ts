import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { RequestError, isRequestAborted, isRequestTimeout, requestJson } from './request.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('requestJson', () => {
  it('resolves successful JSON', async () => {
    globalThis.fetch = async () => jsonResponse({ ok: true });

    const result = await requestJson<{ ok: boolean }>('https://example.test', { timeoutMs: 1000 });

    assert.deepEqual(result, { ok: true });
  });

  it('surfaces a backend failure with its status and message', async () => {
    globalThis.fetch = async () => jsonResponse({ error: 'availability provider unavailable' }, 503);

    await assert.rejects(
      () => requestJson('https://example.test', { timeoutMs: 1000 }),
      (error: unknown) =>
        error instanceof RequestError &&
        error.kind === 'http' &&
        error.status === 503 &&
        error.message === 'availability provider unavailable'
    );
  });

  it('reports a network failure when fetch rejects', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };

    await assert.rejects(
      () => requestJson('https://example.test', { timeoutMs: 1000 }),
      (error: unknown) => error instanceof RequestError && error.kind === 'network'
    );
  });

  it('times out and aborts a request that never resolves', async () => {
    let requestSignal: AbortSignal | undefined;

    globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;

      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        );
      });
    }) as typeof fetch;

    const startedAt = Date.now();

    await assert.rejects(
      () => requestJson('https://example.test', { timeoutMs: 30 }),
      (error: unknown) => isRequestTimeout(error)
    );

    assert.equal(requestSignal?.aborted, true);
    assert.ok(Date.now() - startedAt < 1000);
  });

  it('ignores a response that arrives after the timeout', async () => {
    globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((resolve) => {
        setTimeout(() => resolve(jsonResponse({ late: true })), 150);
        // A real fetch rejects when aborted; this stub deliberately ignores the
        // signal so the wrapper's own guard has to reject the late payload.
        init?.signal?.addEventListener('abort', () => undefined);
      });
    }) as typeof fetch;

    const startedAt = Date.now();

    await assert.rejects(
      () => requestJson('https://example.test', { timeoutMs: 30 }),
      (error: unknown) => isRequestTimeout(error)
    );

    assert.ok(Date.now() - startedAt < 140);
  });

  it('rejects with an aborted error when a newer attempt cancels it', async () => {
    globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        );
      });
    }) as typeof fetch;

    const controller = new AbortController();
    const request = requestJson('https://example.test', {
      timeoutMs: 1000,
      signal: controller.signal,
    });

    controller.abort();

    await assert.rejects(request, (error: unknown) => isRequestAborted(error));
  });
});
