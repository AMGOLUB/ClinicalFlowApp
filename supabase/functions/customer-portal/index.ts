// ────────────────────────────────────────────────────────────
// customer-portal — Creates a Stripe Billing Portal session
// so users can manage their subscription, payment method,
// invoices, and cancellation from within the app.
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

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return jsonResponse({ error: 'No billing account found' }, 404);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: 'https://clinicalflow.ai/billing-return',
    });

    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error('[customer-portal]', err);
    return jsonResponse({ error: 'Portal failed', details: (err as Error).message }, 500);
  }
});
