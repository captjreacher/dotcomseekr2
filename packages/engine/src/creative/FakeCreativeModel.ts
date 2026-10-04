import {
  CreativeKind,
  type CreativeModelOptions,
  type CreativeRequest,
  type CreativeResponse,
  type ICreativeModel,
} from './types.ts';

/**
 * A responder can return a response directly, return a promise, or throw to
 * simulate a model failure. It receives the per-call options so it can honour
 * (or deliberately ignore) the abort signal in tests.
 */
export type FakeCreativeResponder = (
  request: CreativeRequest,
  options: CreativeModelOptions
) => CreativeResponse | Promise<CreativeResponse>;

/**
 * Deterministic default responder: derives a handful of distinct creative
 * directions from the seed so the fake is useful without any custom wiring.
 */
function defaultResponder(request: CreativeRequest): CreativeResponse {
  const base =
    (request.seed ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 10) || 'seed';

  return {
    candidates: [
      {
        value: `${base}ly`,
        kind: CreativeKind.SEMANTIC,
        confidence: 0.6,
        rationale: `Familiar variant of "${request.seed}"`,
      },
      {
        value: `get${base}`.slice(0, 18),
        kind: CreativeKind.ACTION,
        confidence: 0.55,
        rationale: `Action framing around "${request.seed}"`,
      },
    ],
  };
}

/**
 * Hermetic test double for {@link ICreativeModel}.
 *
 * It performs no I/O and never touches the network, which is what makes the
 * default automated test suite independent of any API key that happens to be
 * present in the shell. It also counts invocations so tests can assert the
 * "one creative call per search" contract.
 */
export class FakeCreativeModel implements ICreativeModel {
  readonly id: string;
  private callCount = 0;

  constructor(
    private readonly responder: FakeCreativeResponder = defaultResponder,
    id = 'fake-creative-model'
  ) {
    this.id = id;
  }

  /** Number of generate() invocations so far. */
  get calls(): number {
    return this.callCount;
  }

  reset(): void {
    this.callCount = 0;
  }

  async generate(
    request: CreativeRequest,
    options: CreativeModelOptions = {}
  ): Promise<CreativeResponse> {
    this.callCount += 1;
    return this.responder(request, options);
  }
}

/**
 * Convenience responder that never resolves until its signal aborts, then
 * rejects with an AbortError. Used to prove timeout handling is real.
 */
export function abortableNeverResponder(
  _request: CreativeRequest,
  options: CreativeModelOptions
): Promise<CreativeResponse> {
  return new Promise<CreativeResponse>((_resolve, reject) => {
    const signal = options.signal;
    if (!signal) {
      reject(new Error('no abort signal provided'));
      return;
    }
    if (signal.aborted) {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      return;
    }
    signal.addEventListener('abort', () => {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
  });
}
