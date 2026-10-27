import { RequestError, isRequestTimeout } from '../request.ts';

/**
 * Describe a failed availability or generation call.
 *
 * A failure is explicitly *not* an answer: the copy never suggests the name is
 * taken, and it never implies the model generated something it did not.
 */
export function describeDiscoveryFailure(error: unknown): string {
  if (isRequestTimeout(error)) {
    return 'The registrar took too long to answer, so we stopped waiting. Nothing was marked as taken — try again.';
  }

  if (error instanceof RequestError && error.status === 404) {
    return 'Availability checking is not deployed yet, so no name could be checked.';
  }

  if (error instanceof Error && error.message.trim()) return error.message;

  return 'We could not reach the checking service. Try again.';
}

export function describeVariationFailure(error: unknown): string {
  if (isRequestTimeout(error)) {
    return 'The AI provider took too long to answer. Nothing was generated — try again.';
  }

  if (error instanceof Error && error.message.trim()) return error.message;

  return 'We could not reach the idea service. Try again, or choose another technique.';
}
