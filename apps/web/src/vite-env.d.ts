/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: 'fastify' | 'edge';
  readonly VITE_API_URL: string;
  readonly VITE_SUPABASE_FUNCTIONS_URL?: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
