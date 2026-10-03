// Deno/Edge import-map target for the `@dotcomseekr/shared` bare specifier.
//
// The Supabase Edge (Deno) runtime resolves the *type* graph too, so bare
// workspace specifiers must be mapped to a Deno-resolvable path. This file
// re-exports the shared contracts (no duplication) using explicit extensions so
// the runtime can follow them. It is referenced from
// supabase/functions/dotcomseekr-domain-search/deno.json.
export type { DomainScore } from '../../../packages/shared/src/types/domain.ts';
export type { ScoringWeights } from '../../../packages/shared/src/types/project.ts';
