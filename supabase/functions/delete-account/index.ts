// ────────────────────────────────────────────────────────────
// delete-account — Permanently deletes a user's profile and
// auth record. Requires a valid Bearer token (the user can
// only delete their own account).
// ────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import {
  getServiceClient,
  getTokenFromRequest,
  corsHeaders,
  jsonResponse,
} from '../_shared/supabase-admin.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const token = getTokenFromRequest(req);
  if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);

  const supabase = getServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return jsonResponse({ error: 'Invalid token' }, 401);

  // Require explicit confirmation in the request body
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== true) {
      return jsonResponse({ error: 'Must send { "confirm": true } to delete account' }, 400);
    }

    // Look up Stripe IDs before deleting the profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('id', user.id)
      .single();

    // Cancel Stripe subscription if one exists
    if (profile?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(profile.stripe_subscription_id);
      } catch (stripeErr) {
        // Log but don't block deletion — subscription may already be cancelled
        console.warn('[delete-account] Stripe cancel failed:', (stripeErr as Error).message);
      }
    }

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
