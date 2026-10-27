// Single source of truth exposure of the guided discovery rules to Supabase Edge.
//
// The parsing/validation modules live in `apps/web/src/lib/discovery` because the
// browser re-validates every model answer before rendering it. Re-exporting them
// here keeps one implementation for both runtimes instead of two copies that can
// disagree about what a valid variation is.
export * from '../../../apps/web/src/lib/discovery/types.ts';
export * from '../../../apps/web/src/lib/discovery/domains.ts';
export * from '../../../apps/web/src/lib/discovery/techniques.ts';
export * from '../../../apps/web/src/lib/discovery/variations.ts';
export * from '../../../apps/web/src/lib/discovery/prompt.ts';
