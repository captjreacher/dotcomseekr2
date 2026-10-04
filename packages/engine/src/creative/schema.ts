import { z } from 'zod';
import {
  CreativeKind,
  type CreativeCandidate,
} from './types.ts';

/**
 * Runtime validation for untrusted model output.
 *
 * The model contract is typed, but a real network model can return anything at
 * runtime. We therefore never trust it: each candidate is validated in
 * isolation so one malformed entry cannot poison the whole response, and a
 * completely malformed payload degrades to an empty list.
 */

const creativeCandidateSchema = z.object({
  value: z.string().trim().min(1).max(64),
  kind: z.nativeEnum(CreativeKind),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1).max(280),
});

/**
 * Parse an unknown payload into a list of valid creative candidates.
 *
 * - A non-object payload, or one without a `candidates` array, yields `[]`.
 * - Individual malformed candidates are dropped rather than failing the batch.
 * - The result is capped at `maxCandidates`.
 */
export function parseCreativeResponse(
  raw: unknown,
  maxCandidates: number
): CreativeCandidate[] {
  if (!raw || typeof raw !== 'object') return [];

  const candidatesRaw = (raw as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidatesRaw)) return [];

  const parsed: CreativeCandidate[] = [];
  const limit = Math.max(0, Math.trunc(maxCandidates));

  for (const item of candidatesRaw) {
    const result = creativeCandidateSchema.safeParse(item);
    if (!result.success) continue;

    parsed.push({
      value: result.data.value,
      kind: result.data.kind,
      confidence: result.data.confidence,
      rationale: result.data.rationale,
    });

    if (parsed.length >= limit) break;
  }

  return parsed;
}
