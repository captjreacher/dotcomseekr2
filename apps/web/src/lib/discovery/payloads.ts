// Request payloads for the guided journey.
//
// Everything the server needs to respect the brand boundaries is assembled here
// from session state, so a step cannot forget the meaning, the commentary or the
// selected extensions, and only the technique the user chose is ever sent.
import { domainsForSelection } from './domains.ts';
import type { DiscoverySession } from './session.ts';
import type { DiscoveryMode, Technique } from './types.ts';

export interface VariationRequest {
  action: 'variations';
  technique: Technique;
  mode: DiscoveryMode;
  original: string;
  workingName: string;
  meaning: string;
  meaningSource: string | null;
  commentary: string;
  extensions: string[];
  previous: string[];
}

/** Build the variation request, or null when the brand is not established yet. */
export function variationRequest(
  session: DiscoverySession,
  technique: Technique
): VariationRequest | null {
  const brand = session.brand;
  if (!brand) return null;

  return {
    action: 'variations',
    technique,
    mode: brand.mode,
    original: brand.original,
    workingName: session.workingName || brand.original,
    meaning: brand.meaning,
    meaningSource: brand.meaningSource,
    commentary: brand.commentary,
    extensions: [...brand.extensions],
    previous: [...session.seen],
  };
}

export interface CheckRequest {
  action: 'check';
  domains: string[];
  extensions: string[];
}

/**
 * Build a check request for the names the user explicitly chose.
 *
 * Only selected extensions are used, and only the chosen spellings are checked;
 * nothing is generated or checked in the background.
 */
export function checkRequest(
  session: DiscoverySession,
  spellings: readonly string[]
): CheckRequest | { error: string } {
  const brand = session.brand;
  if (!brand) return { error: 'Establish the brand before checking names.' };
  if (brand.extensions.length === 0) return { error: 'Select at least one extension to check.' };
  if (spellings.length === 0) return { error: 'Choose at least one name to check.' };

  const domains = domainsForSelection(spellings, brand.extensions);
  if (domains.length === 0)
    return { error: 'Those names cannot be checked with these extensions.' };

  return { action: 'check', domains, extensions: [...brand.extensions] };
}
