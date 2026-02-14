import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️  Supabase credentials not configured. Using mock mode.');
      // Return a mock client for development without Supabase
      return createMockSupabaseClient();
    }

    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabase;
}

// Mock Supabase client for development
function createMockSupabaseClient(): any {
  return {
    from: (table: string) => ({
      select: () => ({
        data: [],
        error: null,
      }),
    }),
    auth: {
      getUser: () => ({ data: { user: null }, error: null }),
    },
  };
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = getSupabaseClient();

    // Simple query to check connection
    const { error } = await client.from('users').select('count').limit(1);

    if (error && error.message.includes('relation "public.users" does not exist')) {
      console.warn('⚠️  Database tables not created yet. Run migrations first.');
      return false;
    }

    return !error;
  } catch (err) {
    console.error('Database connection check failed:', err);
    return false;
  }
}
