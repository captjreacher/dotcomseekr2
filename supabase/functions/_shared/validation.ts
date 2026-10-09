// Deno/Edge import target for the shared validation rules.
//
// Like `generation.ts` and `shared-types.ts`, this is a re-export (not a copy)
// so the domain-name rules live in exactly one place: `@dotcomseekr/shared`.
// Supabase Edge resolves relative imports with explicit file extensions, hence
// the `.ts` suffix on the cross-directory boundary.
export * from '../../../packages/shared/src/utils/validation.ts';
