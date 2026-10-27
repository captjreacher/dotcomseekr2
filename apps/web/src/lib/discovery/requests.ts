// Latest-request guard.
//
// Every user-visible request in the journey (exact check, variation round,
// availability batch) is gated: starting a newer request aborts the previous
// one, and a late answer can never win. Cancelling on unmount keeps a stale
// round from updating a step the user has already left.

export interface GatedRequest {
  signal: AbortSignal;
  /** True while this request is still the newest one. */
  isCurrent(): boolean;
}

export interface RequestGate {
  begin(): GatedRequest;
  cancel(): void;
}

export function createRequestGate(): RequestGate {
  let generation = 0;
  let controller: AbortController | null = null;

  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      const id = (generation += 1);

      return {
        signal: controller.signal,
        isCurrent: () => id === generation,
      };
    },
    cancel() {
      generation += 1;
      controller?.abort();
      controller = null;
    },
  };
}
