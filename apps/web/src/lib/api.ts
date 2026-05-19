export const API_MODE = import.meta.env.VITE_API_MODE || 'fastify';
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
export const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL || '';
export const USE_EDGE_API = API_MODE === 'edge';

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    let message = 'Request failed';

    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  return response.json();
}

export function edgeFunctionUrl(name: string) {
  if (!FUNCTIONS_URL) {
    throw new Error('VITE_SUPABASE_FUNCTIONS_URL is required when VITE_API_MODE=edge');
  }

  return `${FUNCTIONS_URL.replace(/\/$/, '')}/${name}`;
}

export function edgeHeaders() {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (import.meta.env.VITE_SUPABASE_ANON_KEY) {
    headers.apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  }

  return headers;
}

export async function healthCheck() {
  const url = USE_EDGE_API ? edgeFunctionUrl('dotcomseekr-health') : `${API_URL}/api/v1/health`;
  return requestJson(url);
}
