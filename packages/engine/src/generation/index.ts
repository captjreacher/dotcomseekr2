// Runtime-neutral deterministic generation core.
// Safe for Node, Deno/Supabase Edge and browser consumers (no fs, no Node APIs).
export * from './types.ts';
export * from './lexicon.ts';
export * from './strategies.ts';
export * from './generate.ts';
