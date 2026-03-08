// ────────────────────────────────────────────────────────────
// supabase-admin.ts — Shared helpers for Edge Functions
// ────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Service-role Supabase client (bypasses RLS). */
export function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

/** Extract Bearer token from Authorization header. Returns null if absent. */
export function getTokenFromRequest(req: Request): string | null {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

/** Allowed CORS origins. */
const ALLOWED_ORIGINS = [
  'https://clinicalflow.us',
  'https://seuinmmslazvibotoupm.supabase.co',
  'http://tauri.localhost', // Tauri v2 desktop webview
];

/** Build CORS headers for a given request. */
export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  };
}

/** Legacy static corsHeaders (for OPTIONS handlers that don't have req). */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://clinicalflow.us',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

/** JSON response helper. */
export function jsonResponse(data: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
  });
}
