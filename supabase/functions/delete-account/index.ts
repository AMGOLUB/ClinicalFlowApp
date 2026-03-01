// ────────────────────────────────────────────────────────────
// delete-account — Permanently deletes a user's profile and
// auth record. Requires a valid Bearer token (the user can
// only delete their own account).
// ────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  getServiceClient,
  getTokenFromRequest,
  corsHeaders,
  jsonResponse,
} from '../_shared/supabase-admin.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const token = getTokenFromRequest(req);
  if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);

  const supabase = getServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return jsonResponse({ error: 'Invalid token' }, 401);

  try {
    // Sever audit log link (subscription_events FK has no CASCADE)
    await supabase.from('subscription_events').update({ user_id: null }).eq('user_id', user.id);

    // Delete profile row (device_activations cascades automatically)
    await supabase.from('profiles').delete().eq('id', user.id);

    // Delete the auth user
    const { error: deleteErr } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteErr) throw deleteErr;

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('[delete-account]', err);
    return jsonResponse({ error: 'Deletion failed', details: (err as Error).message }, 500);
  }
});
