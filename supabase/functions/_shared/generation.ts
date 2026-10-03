// Single-source exposure of the runtime-neutral generation core to Supabase Edge.
//
// This file is NOT a copy and NOT a second generation engine. It re-exports the
// one authoritative implementation from `packages/engine/src/generation`, so the
// deterministic generation logic lives in exactly one place.
//
// Why a re-export instead of importing the engine directly from the function:
// Supabase Edge bundles each function with the Deno module resolver, which
// requires explicit file extensions on relative imports. The engine core uses
// explicit `.ts` extensions (see packages/engine/tsconfig.json) so this chain is
// resolvable, and centralising the cross-directory boundary here keeps the
// function's own import surface stable.
export * from '../../../packages/engine/src/generation/index.ts';
