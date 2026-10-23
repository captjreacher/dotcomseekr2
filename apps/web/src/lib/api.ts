export const API_MODE = import.meta.env.VITE_API_MODE || 'fastify';
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
export const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL || '';
export const USE_EDGE_API = API_MODE === 'edge';

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch {
    throw new Error('We could not reach the naming service. Check your connection and try again.');
  }

  if (!response.ok) {
    throw new Error('We could not generate suggestions right now. Please try again.');
  }

  return response.json();
}

export function edgeFunctionUrl(name: string) {
  if (!FUNCTIONS_URL) {
    throw new Error('The naming service is temporarily unavailable. Please try again.');
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
